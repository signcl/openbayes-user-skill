#!/usr/bin/env node
// Node entrypoint. `run_graphql.sh` is only a wrapper around it, so on Windows
// (no bash) this file is the entrypoint: `node <skill-dir>/scripts/_lib/run_graphql.mjs`
// takes exactly the same arguments (#77 decision 4).
import * as nodeUtil from 'node:util';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  detectOperationType,
  decodeTokenClaims,
  resolveEnv,
  executeGraphQL,
  rewritePublicHost,
} from './graphql-core.mjs';
import {
  extractOperationName,
  buildDescriptor,
  resolveSaveTarget,
} from './save-to-file.mjs';
import { checkForUpdate, clientUserAgent, readInstalledVersion } from './update-check.mjs';
import { sendHeartbeat } from './telemetry.mjs';
import {
  authorizeUrl,
  defaultDeviceName,
  deletePendingLogin,
  deleteSession,
  endpointFromConsoleUrl,
  exchangeCode,
  generatePkcePair,
  readPendingLogin,
  validateVendor,
  writePendingLogin,
  writeSession,
} from './login.mjs';

// The same guard run_graphql.sh applies, so a direct `node …/run_graphql.mjs`
// on an old Node fails with the same message instead of a parseArgs/fetch
// internal error. Namespace import above keeps this reachable on Node < 18.3,
// where a named `parseArgs` import would already fail at link time.
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
if (NODE_MAJOR < 18) {
  process.stderr.write(`[ERROR] Node.js 18+ required (found ${process.version}).\n`);
  process.exit(1);
}
const { parseArgs } = nodeUtil;

const DEFAULT_ENDPOINTS = {
  openbayes: 'https://openbayes.com/gateway/graphql',
  hyperai: 'https://app.hyper.ai/gateway/graphql',
  beta: 'https://beta.openbayes.com/gateway/graphql',
};

// Pre-scan argv so emitFail/emitSuccess know the output format even if we
// fail before parseCliArgs (e.g. unknown flag). parseArgs validates later.
const ENVELOPE_MODE = process.argv.slice(2).includes('--envelope');
const PRETTY_JSON = process.argv.slice(2).includes('--pretty');

function jsonStdout(value) {
  return PRETTY_JSON ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function formatEnvelopeError(envelope) {
  const err = envelope?.error ?? {};
  const lines = [`[${err.type || 'UNKNOWN'}] ${err.message || JSON.stringify(envelope)}`];
  if (envelope?.endpoint) lines.push(`  endpoint: ${envelope.endpoint}`);
  if (envelope?.operation_type) lines.push(`  operation: ${envelope.operation_type}`);
  if (envelope?.detail) {
    lines.push('  detail:');
    for (const line of JSON.stringify(envelope.detail, null, 2).split('\n')) {
      lines.push(`    ${line}`);
    }
  }
  return lines.join('\n');
}

function formatGraphqlErrors(errors) {
  return errors.map((e, i) => {
    const path = Array.isArray(e.path) && e.path.length ? ` at ${e.path.join('.')}` : '';
    const loc = Array.isArray(e.locations) && e.locations.length
      ? ` (line ${e.locations[0].line}, col ${e.locations[0].column})`
      : '';
    return `  [${i + 1}] ${e.message}${path}${loc}`;
  }).join('\n');
}

function emitEnvelope(envelope, code) {
  process.stdout.write(jsonStdout(envelope) + '\n');
  process.exit(code);
}

function emitFail(envelope) {
  if (ENVELOPE_MODE) emitEnvelope(envelope, 1);
  process.stderr.write(formatEnvelopeError(envelope) + '\n');
  process.exit(1);
}

function emitGraphqlFail(envelope) {
  if (ENVELOPE_MODE) emitEnvelope(envelope, 1);
  const errors = envelope?.result?.errors ?? [];
  const header = envelope?.result?.data == null
    ? 'GraphQL request failed:'
    : 'GraphQL request returned errors (data is partial; rerun with --envelope to inspect):';
  process.stderr.write(`${header}\n${formatGraphqlErrors(errors)}\n`);
  process.exit(1);
}

function emitSuccess(envelope) {
  if (ENVELOPE_MODE) emitEnvelope(envelope, 0);
  process.stdout.write(jsonStdout(envelope.result?.data ?? null) + '\n');
  process.exit(0);
}

function emitDescriptor(envelope, descriptor) {
  if (ENVELOPE_MODE) {
    const out = { ...envelope, result: { descriptor } };
    process.stdout.write(jsonStdout(out) + '\n');
  } else {
    process.stdout.write(jsonStdout(descriptor) + '\n');
  }
  process.exit(0);
}

function writeDataFile(savedPath, data) {
  mkdirSync(dirname(savedPath), { recursive: true });
  // File is always pretty-printed regardless of stdout `--pretty`. The agent
  // workflow (`head`, `wc -l`, `jq`) collapses without line breaks.
  writeFileSync(savedPath, JSON.stringify(data, null, 2) + '\n');
}

function fail(type, message, extra = {}) {
  emitFail({ ok: false, error: { type, message }, ...extra });
}

function parseCliArgs() {
  try {
    const { values } = parseArgs({
      options: {
        vendor: { type: 'string', default: 'openbayes' },
        'env-file': { type: 'string' },
        query: { type: 'string' },
        'query-file': { type: 'string' },
        'vars-json': { type: 'string' },
        'vars-file': { type: 'string' },
        'ssl-verify': { type: 'string' },
        'confirm-mutation-target': { type: 'string' },
        envelope: { type: 'boolean', default: false },
        identity: { type: 'boolean', default: false },
        login: { type: 'boolean', default: false },
        logout: { type: 'boolean', default: false },
        device: { type: 'string' },
        code: { type: 'string' },
        paste: { type: 'boolean', default: false },
        endpoint: { type: 'string' },
        pretty: { type: 'boolean', default: false },
        'save-to': { type: 'string' },
        'save-to-default': { type: 'boolean', default: false },
        'check-update': { type: 'boolean', default: false },
      },
      strict: true,
    });
    validateVendor(values.vendor);
    return values;
  } catch (err) {
    fail('INVALID_INPUT', err.message);
  }
}

function readQuery(args) {
  const hasQuery = Boolean(args.query);
  const hasFile = Boolean(args['query-file']);
  if (hasQuery === hasFile) {
    fail('INVALID_INPUT', 'Provide exactly one of --query or --query-file.');
  }
  if (hasQuery) return args.query;
  const path = resolve(args['query-file']);
  if (!existsSync(path)) fail('QUERY_FILE_NOT_FOUND', `Query file not found: ${path}`);
  return readFileSync(path, 'utf-8');
}

function readVars(args) {
  const hasJson = Boolean(args['vars-json']);
  const hasFile = Boolean(args['vars-file']);
  if (hasJson && hasFile) {
    fail('INVALID_VARS', 'Provide at most one of --vars-file or --vars-json.');
  }
  if (!hasJson && !hasFile) return {};
  let payload;
  if (hasJson) {
    payload = args['vars-json'];
  } else {
    const path = resolve(args['vars-file']);
    if (!existsSync(path)) fail('VARS_FILE_NOT_FOUND', `Variables file not found: ${path}`);
    payload = readFileSync(path, 'utf-8');
  }
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    fail('INVALID_VARS_JSON', `Invalid JSON in variables: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('INVALID_VARS_TYPE', 'Variables JSON must be an object.');
  }
  return parsed;
}

function resolveSslVerify(args, envValues) {
  if (args['ssl-verify'] != null) {
    if (!['true', 'false'].includes(args['ssl-verify'])) {
      fail('INVALID_INPUT', '--ssl-verify must be true or false.');
    }
    return args['ssl-verify'] === 'true';
  }
  const raw = (envValues.OPENBAYES_SSL_VERIFY || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return true;
}

function buildResolutionDetail(vendor, metadata) {
  return {
    vendor,
    cwd: process.cwd(),
    forbidden_skill_dir: metadata.forbiddenSkillDir,
    searched_paths: metadata.searchedPaths,
    resolved_env_file: metadata.resolvedEnvFile,
    resolved_session_file: metadata.resolvedSessionFile,
    warnings: metadata.warnings,
    user_config_dir: metadata.userConfigDir,
  };
}

// `--identity` answers "which account would this invocation act as" without
// sending anything. Share resolveEnv with requests so both use exactly the
// same profile session and never accept a legacy token source.
function emitIdentity(args) {
  const { envValues, envSources, metadata } = resolveEnv({
    envFile: args['env-file'] ?? null,
    vendor: args.vendor,
    cwd: process.cwd(),
    homeDir: homedir(),
    processEnv: process.env,
  });

  if (metadata.explicitEnvFileMissing) {
    fail('ENV_FILE_NOT_FOUND', `Env file does not exist: ${metadata.explicitEnvFileMissing}`, {
      detail: buildResolutionDetail(args.vendor, metadata),
    });
  }
  const token = envValues.OPENBAYES_TOKEN;
  if (!token) {
    fail(
      'MISSING_TOKEN',
      `Not logged in. Run --login --vendor ${args.vendor}; legacy env tokens are no longer accepted.`,
      { detail: buildResolutionDetail(args.vendor, metadata) },
    );
  }

  const claims = decodeTokenClaims(token);
  const out = {
    vendor: args.vendor,
    endpoint: envValues.OPENBAYES_GRAPHQL_ENDPOINT || DEFAULT_ENDPOINTS[args.vendor] || null,
    // Container deployments reach an internal endpoint; links shown to the user
    // use this public host instead (see rewritePublicHost below).
    ...(envValues.OPENBAYES_PUBLIC_BASE_URL ? { public_base_url: envValues.OPENBAYES_PUBLIC_BASE_URL } : {}),
    token_source: envSources.OPENBAYES_TOKEN,
    ...(claims.ok
      ? { sub: claims.sub, kind: claims.kind, jti: claims.jti, expires_at: claims.expiresAt, expired: claims.expired }
      : { sub: null, undecodable: claims.reason }),
    // Stated on every response so the output is never mistaken for proof the
    // server accepts this token.
    verified: false,
    note: 'Claims are read from the token without signature verification; revoked or server-rejected tokens still decode. Confirm with a whoami query.',
  };
  process.stdout.write(JSON.stringify(out, null, args.pretty ? 2 : 0) + '\n');
  process.exit(0);
}

// `--check-update`: at most one versions.json fetch per day, state under the
// user config dir. Never fails the caller — a failed fetch is a field in the
// verdict and exit code 0, so an offline machine still runs its query.
async function emitUpdateCheck(args) {
  let verdict;
  try {
    const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    verdict = await checkForUpdate({
      skillDir,
      userConfigDir: join(homedir(), '.config', 'openbayes-skills'),
      versionsUrl: process.env.OPENBAYES_SKILLS_VERSIONS_URL || undefined,
    });
  } catch (err) {
    // Last line of defence for anything the module did not anticipate
    // (unreadable HOME, EROFS on rename …): still exit 0, still a verdict.
    verdict = { current: null, latest: null, update_available: false, checked: false, error: err?.message || String(err) };
  }
  process.stdout.write(JSON.stringify(verdict, null, args.pretty ? 2 : 0) + '\n');
  process.exit(0);
}

function readStdinLine(prompt) {
  process.stdout.write(prompt);
  return new Promise((resolveLine) => {
    let data = '';
    const finish = () => {
      process.stdin.pause();
      resolveLine(data.trim());
    };
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\n')) finish();
    });
    process.stdin.on('end', finish);
  });
}

// `--login`：一次性授权码换 PAT，写入 session.<vendor>.json。
// 密钥对只在本地生成；明文 PAT 仅写入 session 文件，不回显。
// 两段式：第一段打印授权页 URL 后退出（verifier 落在 login-pending.<vendor>.json）；
// 用户确认后第二段用 --code 继续复用同一 verifier。第一段默认不等待终端输入，
// 只有显式 --paste 才在提示符下粘贴一次性码。
async function runLogin(args) {
  const vendor = args.vendor;
  const userConfigDir = join(homedir(), '.config', 'openbayes-skills');

  const deviceName = args.device || defaultDeviceName();

  // Both login phases share query-time non-credential settings. Phase 2 still
  // takes its endpoint and verifier exclusively from the pending login.
  const { envValues, metadata } = resolveEnv({
    envFile: args['env-file'] ?? null,
    vendor,
    cwd: process.cwd(),
    homeDir: homedir(),
    processEnv: process.env,
  });
  if (metadata.explicitEnvFileMissing) {
    fail('ENV_FILE_NOT_FOUND', `Env file does not exist: ${metadata.explicitEnvFileMissing}`);
  }
  if (!resolveSslVerify(args, envValues)) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  // 第二段：拿码完成交换，复用 pending 里的 verifier。
  if (args.code) {
    const { pending, expired } = readPendingLogin({ userConfigDir, vendor });
    if (!pending) {
      fail(
        expired ? 'LOGIN_PENDING_EXPIRED' : 'NO_PENDING_LOGIN',
        expired
          ? `The pending login for vendor "${vendor}" expired. Re-run --login to get a fresh authorize URL.`
          : `No pending login for vendor "${vendor}". Run --login first (it prints the authorize URL), then --code <one-time-code>.`
      );
    }
    let payload;
    try {
      payload = await exchangeCode({
        endpoint: pending.endpoint,
        code: args.code,
        codeVerifier: pending.verifier,
        userAgent: clientUserAgent(),
      });
    } catch (err) {
      // 保留 pending：码可能在有效期内重试（10 分钟 TTL 兑底）。交换失败服务端只回通用错误。
      fail('LOGIN_EXCHANGE_FAILED', err?.message || String(err));
    }
    const session = {
      vendor,
      endpoint: pending.endpoint,
      token: payload.token,
      deviceName: pending.deviceName || deviceName,
      tokenName: payload.personalAccessToken?.name || null,
      tokenId: payload.personalAccessToken?.id || null,
      expiresAt: payload.personalAccessToken?.expiresAt || null,
      createdAt: new Date().toISOString(),
    };
    const path = writeSession({ userConfigDir, vendor, session });
    deletePendingLogin({ userConfigDir, vendor, expectedVerifier: pending.verifier });
    process.stdout.write(
      [
        `Logged in as vendor "${vendor}" (token name: ${session.tokenName}, expires: ${session.expiresAt}).`,
        `Session saved to ${path} (mode 0600; the token is never printed).`,
        `Verify with: run_graphql --identity --vendor ${vendor}`,
        '',
      ].join('\n')
    );
    process.exit(0);
  }

  // First-phase address selection; this never overrides phase 2's pending target.
  let endpoint;
  try {
    endpoint = args.endpoint
      ? endpointFromConsoleUrl(args.endpoint)
      : envValues.OPENBAYES_GRAPHQL_ENDPOINT || DEFAULT_ENDPOINTS[vendor];
  } catch (err) {
    fail('INVALID_INPUT', `Invalid --endpoint value: ${err?.message || err}`);
  }
  if (!endpoint) {
    fail('INVALID_INPUT', `Unknown vendor "${vendor}" and no endpoint provided. Pass --endpoint <console-url-or-gateway-endpoint> or configure OPENBAYES_GRAPHQL_ENDPOINT.`);
  }

  // 第一段：生成密钥对，落 pending，打印授权页 URL。
  const { verifier, challenge } = generatePkcePair();
  const url = authorizeUrl({ endpoint, codeChallenge: challenge, deviceName });
  writePendingLogin({ userConfigDir, vendor, verifier, endpoint, deviceName });

  process.stdout.write(
    [
      `Vendor: ${vendor}`,
      `Endpoint: ${endpoint}`,
      `Device: ${deviceName}`,
      '',
      '1. 在浏览器打开下面的授权页（需已登录该环境控制台）：',
      `   ${url}`,
      '2. 在页面上选择令牌有效期并确认；',
      '3. 复制页面显示的一次性码（5 分钟内有效），随后用第二段命令完成登录：',
      `   run_graphql --login --vendor ${vendor} --code <一次性码>`,
      '',
    ].join('\n')
  );
  // 仅显式 --paste 时才在提示符下等待粘贴，且不以 stdin.isTTY 判断：
  // PTY 型 agent 环境（如 workbuddy）isTTY 为真但永远无人输入，会无限挂起。
  const code = args.paste ? await readStdinLine('One-time code: ') : '';
  if (!code) {
    process.stdout.write(
      [
        '（未收到一次性码：授权 URL 与登录状态已保存，5–10 分钟内拿到码后继续：）',
        `   run_graphql --login --vendor ${vendor} --code <一次性码>`,
        ...(args.paste ? [] : ['（真人终端想在本命令内直接粘贴，可加 --paste 重新发起第一段。）']),
        '',
      ].join('\n')
    );
    process.exit(0);
  }

  let payload;
  try {
    payload = await exchangeCode({ endpoint, code, codeVerifier: verifier, userAgent: clientUserAgent() });
  } catch (err) {
    fail('LOGIN_EXCHANGE_FAILED', err?.message || String(err));
  }
  const session = {
    vendor,
    endpoint,
    token: payload.token,
    deviceName,
    tokenName: payload.personalAccessToken?.name || null,
    tokenId: payload.personalAccessToken?.id || null,
    expiresAt: payload.personalAccessToken?.expiresAt || null,
    createdAt: new Date().toISOString(),
  };
  const path = writeSession({ userConfigDir, vendor, session });
  deletePendingLogin({ userConfigDir, vendor, expectedVerifier: verifier });
  process.stdout.write(
    [
      `Logged in as vendor "${vendor}" (token name: ${session.tokenName}, expires: ${session.expiresAt}).`,
      `Session saved to ${path} (mode 0600; the token is never printed).`,
      `Verify with: run_graphql --identity --vendor ${vendor}`,
      '',
    ].join('\n')
  );
  process.exit(0);
}

// `--logout`：删除本地 session。吊销令牌去 console 的 PAT 管理页。
function runLogout(args) {
  const userConfigDir = join(homedir(), '.config', 'openbayes-skills');
  const { existed, path } = deleteSession({ userConfigDir, vendor: args.vendor });
  if (existed) {
    process.stdout.write(`Session for vendor "${args.vendor}" removed (${path}).\n`);
  } else {
    process.stdout.write(
      `No session file for vendor "${args.vendor}" (${path}). To revoke the token itself, use the console PAT page.\n`
    );
  }
  process.exit(0);
}

async function main() {
  const args = parseCliArgs();
  if (args.identity) emitIdentity(args);
  if (args['check-update']) await emitUpdateCheck(args);
  if (args.login) await runLogin(args);
  if (args.logout) runLogout(args);

  const queryText = readQuery(args);
  const variables = readVars(args);
  const opType = detectOperationType(queryText);

  const { envValues, envSources, metadata } = resolveEnv({
    envFile: args['env-file'] ?? null,
    vendor: args.vendor,
    cwd: process.cwd(),
    homeDir: homedir(),
    processEnv: process.env,
  });

  if (metadata.explicitEnvFileMissing) {
    fail('ENV_FILE_NOT_FOUND', `Env file does not exist: ${metadata.explicitEnvFileMissing}`, {
      detail: buildResolutionDetail(args.vendor, metadata),
    });
  }

  const sslVerify = resolveSslVerify(args, envValues);
  if (!sslVerify) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const token = envValues.OPENBAYES_TOKEN;
  if (!token) {
    fail(
      'MISSING_TOKEN',
      `Not logged in. Run --login --vendor ${args.vendor}; legacy env tokens are no longer accepted.`,
      { detail: buildResolutionDetail(args.vendor, metadata) },
    );
  }
  const endpoint = envValues.OPENBAYES_GRAPHQL_ENDPOINT;
  const tokenSource = envSources.OPENBAYES_TOKEN;

  // Anonymous daily heartbeat (at most one POST per install per 24 h, payload
  // is exactly {version, install_id}): fired only on the real query path, so
  // --identity/--check-update stay send-free. Bounded by the fetch timeout and
  // silent by contract — a dead analytics endpoint can never fail a query.
  const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const skillVersion = readInstalledVersion(skillDir);
  try {
    await sendHeartbeat({ skillDir, userConfigDir: join(homedir(), '.config', 'openbayes-skills') });
  } catch {
    // sendHeartbeat already swallows its own errors; this is the last line of
    // defence for anything unanticipated (e.g. a read-only HOME).
  }

  if (opType === 'mutation' && !args['confirm-mutation-target']) {
    fail(
      'MUTATION_CONFIRMATION_REQUIRED',
      "Mutation requires --confirm-mutation-target '<vendor>:<endpoint>'.",
    );
  }
  if (args['confirm-mutation-target']) {
    const expected = `${args.vendor}:${endpoint}`;
    if (args['confirm-mutation-target'] !== expected) {
      fail(
        'MUTATION_TARGET_MISMATCH',
        `Expected --confirm-mutation-target '${expected}', got '${args['confirm-mutation-target']}'.`,
      );
    }
  }

  let result;
  try {
    result = await executeGraphQL({ endpoint, token, query: queryText, variables, userAgent: clientUserAgent(skillVersion) });
  } catch (err) {
    // fetch 失败时 err.message 只有 "fetch failed"，真实原因（ECONNRESET/ETIMEDOUT 等）在 err.cause 里
    const cause = err.cause ? ` (cause: ${err.cause.code || err.cause.message || err.cause})` : '';
    emitFail({
      ok: false,
      error: { type: 'GRAPHQL_EXECUTION_ERROR', message: `${err.message}${cause}` },
      vendor: args.vendor,
      endpoint,
      operation_type: opType,
    });
  }

  const publicBaseUrl = envValues.OPENBAYES_PUBLIC_BASE_URL || null;
  if (publicBaseUrl && result?.data != null) {
    result = {
      ...result,
      data: rewritePublicHost(result.data, {
        internalEndpoint: endpoint,
        publicBaseUrl,
      }),
    };
  }

  const envelope = {
    ok: true,
    vendor: args.vendor,
    endpoint,
    operation_type: opType,
    token_source: tokenSource,
    ssl_verify: sslVerify,
    result,
  };

  if (Array.isArray(result?.errors) && result.errors.length > 0) {
    emitGraphqlFail(envelope);
  }

  // Save mode (opt-in via --save-to / --save-to-default): pretty-print the
  // data to disk and emit a stable descriptor on stdout instead of the raw
  // payload. Errors above never reach here, so failed responses are never
  // saved — agents see them inline as today.
  const operationName = extractOperationName(queryText);
  let saveTarget = null;
  try {
    saveTarget = resolveSaveTarget({ args, envValues, operation: operationName });
  } catch (err) {
    fail('INVALID_INPUT', err.message.replace(/^INVALID_INPUT:\s*/, ''));
  }
  if (saveTarget) {
    const data = result?.data ?? null;
    writeDataFile(saveTarget, data);
    const descriptor = buildDescriptor({
      data,
      savedPath: saveTarget,
      operation: operationName,
      operationType: opType,
      sizeBytes: Buffer.byteLength(JSON.stringify(data) ?? 'null', 'utf-8'),
    });
    emitDescriptor(envelope, descriptor);
  }

  emitSuccess(envelope);
}

main().catch((err) => {
  fail('GRAPHQL_EXECUTION_ERROR', err?.message || String(err));
});
