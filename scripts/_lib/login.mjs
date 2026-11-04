#!/usr/bin/env node
// CLI 一次性授权码登录：配合 api-server 的 exchangeCliAuthorizationCode 与
// console 的授权页（/console/settings/account/cli/authorize）。
//
// 流程（PKCE S256, RFC 7636）：
//   1. 本地生成 codeVerifier / codeChallenge；
//   2. 拼 console 授权页 URL（带 code_challenge 与 device），用户在浏览器用
//      已登录会话确认，页面显示 5 分钟单次有效的一次性码；
//   3. 用户把码粘贴回来，本模块匿名调 exchangeCliAuthorizationCode 换 PAT；
//   4. PAT 写入 session.<vendor>.json（0600），不回显。
//
// 凭据纪律与 .env.* 同级：session 文件由本客户端读写，任何 skill 文案 /
// 手工命令不得打开其内容（tests/asserts/no-credential-open.mjs 同步断言）。
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';

export const EXCHANGE_MUTATION = `
mutation ExchangeCliAuthorizationCode($input: ExchangeCliAuthorizationCodeInput!) {
  exchangeCliAuthorizationCode(input: $input) {
    token
    personalAccessToken {
      id
      name
      expiresAt
    }
  }
}
`;

export function validateVendor(vendor) {
  if (typeof vendor !== 'string' || !vendor.trim() || vendor === '.' || vendor === '..' ||
      /[\\/\x00-\x1f\x7f]/.test(vendor)) {
    throw new Error('--vendor must be a non-empty profile name without path separators, traversal components or control characters.');
  }
  return vendor;
}

export function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** RFC 7636 附录 B 的官方向量可作为固定测试数据：
 *  verifier  dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
 *  challenge E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM */
export function challengeFromVerifier(verifier) {
  return base64url(createHash('sha256').update(verifier, 'ascii').digest());
}

export function generatePkcePair() {
  // 32 字节随机数 base64url 后恰为 43 字符，满足服务端 ^[A-Za-z0-9_-]{43}$ 校验。
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: challengeFromVerifier(verifier) };
}

function parseEndpointUrl(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('invalid endpoint/console URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('endpoint must use HTTP or HTTPS');
  return url;
}

/** gateway endpoint（…/gateway/graphql）→ console 根（…/console）。 */
export function consoleUrlFromEndpoint(endpoint) {
  const url = parseEndpointUrl(endpoint);
  return `${url.protocol}//${url.host}/console`;
}

/** 用户给控制台地址（或裸域名）也能用：归一成 gateway endpoint。
 * 已是 …/gateway/graphql 则原样返回；否则取 scheme+host 拼 /gateway/graphql。 */
export function endpointFromConsoleUrl(input) {
  const trimmed = String(input || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('empty endpoint/console url');
  const absolute = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed : `https://${trimmed}`;
  const url = parseEndpointUrl(absolute);
  return `${url.protocol}//${url.host}/gateway/graphql`;
}

/** 两段式登录的待完成状态：agent 环境没有交互 stdin，第一段打印授权 URL 后
 * 退出，verifier 落在这里；第二段用 --code 继续时取回同一个 verifier，
 * 保证与用户确认过的 challenge 配对。仅存 verifier（换不出 token 的半成品），
 * 0600 + 10 分钟 TTL，成功或过期后清除。 */
const PENDING_TTL_MS = 10 * 60 * 1000;

export function pendingLoginPath({ userConfigDir, vendor }) {
  validateVendor(vendor);
  return join(userConfigDir, `login-pending.${vendor}.json`);
}

// Create privately, then replace atomically: never write fresh secrets into an
// existing loose-permission file (or follow its symlink). Both credential types share this rule.
function writePrivateJson(userConfigDir, path, value) {
  mkdirSync(userConfigDir, { recursive: true, mode: 0o700 });
  const tempDir = mkdtempSync(join(userConfigDir, '.credential-'));
  try {
    const tempPath = join(tempDir, 'value.json');
    writeFileSync(tempPath, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(tempPath, path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return path;
}

export function writePendingLogin({ userConfigDir, vendor, verifier, endpoint, deviceName }) {
  return writePrivateJson(userConfigDir, pendingLoginPath({ userConfigDir, vendor }), {
    vendor, verifier, endpoint, deviceName, createdAt: new Date().toISOString(),
  });
}

export function readPendingLogin({ userConfigDir, vendor, now = Date.now() }) {
  const path = pendingLoginPath({ userConfigDir, vendor });
  if (!existsSync(path)) return { pending: null, path };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return { pending: null, path, corrupt: true };
  }
  const created = parsed?.createdAt ? Date.parse(parsed.createdAt) : NaN;
  const fresh =
    parsed?.verifier && parsed?.endpoint && Number.isFinite(created) && now - created < PENDING_TTL_MS;
  return { pending: fresh ? parsed : null, path, expired: Boolean(parsed) && !fresh };
}

export function deletePendingLogin({ userConfigDir, vendor, expectedVerifier }) {
  const path = pendingLoginPath({ userConfigDir, vendor });
  if (expectedVerifier != null) {
    try {
      const pending = JSON.parse(readFileSync(path, 'utf-8'));
      if (pending?.verifier !== expectedVerifier) return;
    } catch {
      return;
    }
  }
  if (existsSync(path)) rmSync(path);
}

export function authorizeUrl({ endpoint, codeChallenge, deviceName }) {
  const base = consoleUrlFromEndpoint(endpoint);
  const params = new URLSearchParams({ code_challenge: codeChallenge, device: deviceName });
  return `${base}/settings/account/cli/authorize?${params}`;
}

export function sessionFilePath({ userConfigDir, vendor }) {
  validateVendor(vendor);
  return join(userConfigDir, `session.${vendor}.json`);
}

export function readSession({ userConfigDir, vendor }) {
  const path = sessionFilePath({ userConfigDir, vendor });
  if (!existsSync(path)) return { session: null, path };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return { session: null, path, corrupt: true };
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.token) {
    return { session: null, path, corrupt: true };
  }
  return { session: parsed, path };
}

export function writeSession({ userConfigDir, vendor, session }) {
  return writePrivateJson(userConfigDir, sessionFilePath({ userConfigDir, vendor }), session);
}

export function deleteSession({ userConfigDir, vendor }) {
  const path = sessionFilePath({ userConfigDir, vendor });
  const existed = existsSync(path);
  if (existed) rmSync(path);
  return { existed, path };
}

/** PAT 名为 `CLI · <设备名>`，服务端限制整体长度，设备名保守截断。 */
export function defaultDeviceName() {
  const raw = (hostname() || 'agent').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 16);
  return raw || 'agent';
}

/** 匿名换 PAT。刻意不走 graphql-core 的 executeGraphQL：那里固定带
 *  Authorization 头，而本调用必须匿名；同时 api-server 的 CORS 层会拒绝
 *  无 Origin / Origin 不在白名单的请求，故带 endpoint 同源 Origin。 */
export async function exchangeCode({ endpoint, code, codeVerifier, userAgent }) {
  const url = parseEndpointUrl(endpoint);
  const origin = `${url.protocol}//${url.host}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Referer: `${origin}/`,
      ...(userAgent ? { 'user-agent': userAgent } : {}),
    },
    body: JSON.stringify({
      query: EXCHANGE_MUTATION,
      variables: { input: { code, codeVerifier } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }
  const body = await response.json();
  if (body.errors?.length) {
    // 交换失败（码不存在 / 已用 / 过期 / PKCE 不匹配）服务端返回同一条通用错误。
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }
  const payload = body.data?.exchangeCliAuthorizationCode;
  if (!payload?.token) {
    throw new Error('exchangeCliAuthorizationCode 未返回 token');
  }
  return payload;
}
