// Pure library for the OpenBayes GraphQL client CLI.
// All exports are unit-tested from shared/graphql-client/test/graphql-core.test.mjs.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';

export function normalizeToken(token) {
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

// Read the claims a token asserts about itself, WITHOUT verifying the
// signature — we do not hold the signing secret, so this can only ever answer
// "who was this minted for", never "will the server accept it".
//
// Its job is catching your own configuration mistakes: which account a resolved
// credential belongs to, offline and without a round-trip. That is the missing
// half between `token_source` (which FILE was used) and whoami (which identity
// the SERVER grants) — and it is the only one of the three that stays available
// when the endpoint is unreachable.
//
// Deliberately never returns the token or its signature segment. `sub` falls
// back to `user_name` to match the server's own getSubFromToken, which accepts
// that legacy claim.
export function decodeTokenClaims(token) {
  if (typeof token !== 'string' || !token) {
    return { ok: false, reason: 'EMPTY_TOKEN' };
  }
  const raw = token.startsWith('Bearer ') ? token.slice(7) : token;
  const parts = raw.split('.');
  if (parts.length !== 3) {
    // Opaque/non-JWT credentials are legal as far as this client is concerned;
    // they just cannot be introspected locally.
    return { ok: false, reason: 'NOT_A_JWT' };
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'UNDECODABLE_PAYLOAD' };
  }
  if (!claims || typeof claims !== 'object') {
    return { ok: false, reason: 'UNDECODABLE_PAYLOAD' };
  }

  const sub = claims.sub ?? claims.user_name ?? null;
  const exp = typeof claims.exp === 'number' ? claims.exp : null;
  return {
    ok: true,
    sub,
    // "PAT" for a personal access token; absent for an ordinary login session.
    kind: claims.typ === 'PAT' ? 'personal-access-token' : 'session',
    // Registry primary key — only PATs carry it, and it is what revoke takes.
    jti: typeof claims.jti === 'string' ? claims.jti : null,
    issuer: claims.iss ?? null,
    path: claims.path ?? null,
    expiresAt: exp === null ? null : new Date(exp * 1000).toISOString(),
    // A token past `exp` is definitely dead; one inside it may still be dead
    // (revoked, or the record deleted). Only the server knows that.
    expired: exp === null ? null : exp * 1000 <= Date.now(),
  };
}

export function detectOperationType(queryText) {
  // Operation keywords only count at brace depth 0 — a document may open with
  // fragment definitions, so prefix-matching alone lets `fragment … mutation …`
  // slip past the mutation confirmation gate.
  const cleaned = queryText
    .replace(/"""[\s\S]*?"""/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/#.*/g, ' ')
    .toLowerCase();
  const topLevelWords = [];
  let depth = 0;
  let word = '';
  for (const ch of cleaned) {
    if (ch === '{' || ch === '}') {
      if (depth === 0 && word) topLevelWords.push(word);
      word = '';
      depth = ch === '{' ? depth + 1 : Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    if (/[a-z_0-9]/.test(ch)) {
      word += ch;
    } else {
      if (word) topLevelWords.push(word);
      word = '';
    }
  }
  if (word) topLevelWords.push(word);
  if (topLevelWords.includes('mutation')) return 'mutation';
  if (topLevelWords.includes('query')) return 'query';
  return 'unknown';
}

function stripMatchingQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) return value.slice(1, -1);
  }
  return value;
}

// Two formats. A file whose whole content (trimmed — String#trim also drops a
// BOM and CR) is a single line with no '=' is the bare OPENBAYES_TOKEN, which
// is what users get by pasting the token from the console (#120). Anything
// else is KEY=VALUE lines. Multi-line or comment-led content without '=' is
// not guessed at: it yields no token, never a garbage one.
export function loadEnvFile(path) {
  const text = readFileSync(path, 'utf-8');
  const whole = text.trim();
  if (whole && !whole.includes('=') && !/[\r\n]/.test(whole) && !whole.startsWith('#')) {
    const token = stripMatchingQuotes(whole).trim();
    return token ? { OPENBAYES_TOKEN: token } : {};
  }
  const values = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    values[key] = stripMatchingQuotes(line.slice(eq + 1).trim());
  }
  return values;
}

function isPackagedSkillDir(path) {
  return existsSync(join(path, 'SKILL.md')) && existsSync(join(path, 'scripts', 'run_graphql.sh'));
}

export function getForbiddenSkillDir(startPath) {
  let current = resolve(startPath);
  while (true) {
    if (isPackagedSkillDir(current)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveEnv({ envFile, vendor, cwd, homeDir, processEnv }) {
  const envValues = {};
  const envSources = {};
  const userConfigDir = join(homeDir, '.config', 'openbayes-skills');
  const forbiddenSkillDir = getForbiddenSkillDir(cwd);
  const metadata = {
    searchedPaths: [],
    envResolutionTrace: [],
    resolvedEnvFile: null,
    warnings: [],
    explicitEnvFileMissing: null,
    userConfigDir,
    forbiddenSkillDir,
  };

  const loadInto = (path, sourceLabel) => {
    for (const [k, v] of Object.entries(loadEnvFile(path))) {
      envValues[k] = v;
      envSources[k] = sourceLabel;
    }
  };

  if (envFile) {
    if (envFile === '~' || envFile.startsWith('~/')) {
      envFile = resolve(homeDir, envFile.slice(envFile === '~' ? 1 : 2));
    } else {
      envFile = resolve(envFile);
    }
    const exists = existsSync(envFile);
    metadata.searchedPaths.push(envFile);
    metadata.envResolutionTrace.push({ source: 'env-file', path: envFile, exists, used: exists });
    if (exists) {
      loadInto(envFile, `env-file:${envFile}`);
      metadata.resolvedEnvFile = envFile;
    } else {
      // Fallback: LLM agents sometimes fabricate paths like $HOME/.env.beta when
      // the user really meant the file in cwd or user-config. Try the basename
      // in userConfigDir and cwd before giving up. Warn so misconfigurations
      // are not silently masked.
      // path.basename, not split('/'): on Windows the resolved path uses '\\'.
      const base = basename(envFile);
      const looksLikeEnvFile = /^\.env(\.|$)/.test(base);
      const fallbacks = looksLikeEnvFile
        ? [
            { source: 'env-file-fallback:user-config', path: join(userConfigDir, base) },
            { source: 'env-file-fallback:cwd', path: join(cwd, base) },
          ]
        : [];
      let recovered = false;
      for (const fb of fallbacks) {
        const fbExists = existsSync(fb.path);
        const skipForbidden =
          fb.source === 'env-file-fallback:cwd' && forbiddenSkillDir;
        const used = !recovered && fbExists && !skipForbidden;
        metadata.searchedPaths.push(fb.path);
        metadata.envResolutionTrace.push({
          source: fb.source,
          path: fb.path,
          exists: fbExists,
          used,
        });
        if (used) {
          loadInto(fb.path, fb.source);
          metadata.resolvedEnvFile = fb.path;
          metadata.warnings.push(
            `--env-file ${envFile} not found; fell back to ${fb.path}. ` +
            `Pass an existing absolute path or run from the correct cwd to silence this warning.`
          );
          recovered = true;
        } else if (fbExists && skipForbidden) {
          metadata.warnings.push(
            `Skipping cwd fallback for missing --env-file ${envFile}: ` +
            `cwd is a packaged skill dir (${forbiddenSkillDir}).`
          );
        }
      }
      if (!recovered) {
        metadata.explicitEnvFileMissing = envFile;
      }
    }
  } else {
    const candidates = [
      { source: 'cwd', path: join(cwd, `.env.${vendor}`) },
      { source: 'user-config', path: join(userConfigDir, `.env.${vendor}`) },
    ];
    let resolved = false;
    for (const { source, path } of candidates) {
      const exists = existsSync(path);
      let used = false;
      if (source === 'cwd' && forbiddenSkillDir) {
        if (exists) {
          metadata.warnings.push(
            `Ignoring env file in forbidden skill directory: ${path}. ` +
            `Do not keep credentials under packaged skill directories such as ${forbiddenSkillDir}.`
          );
        }
      } else if (exists && !resolved) {
        loadInto(path, `${source}:${path}`);
        metadata.resolvedEnvFile = path;
        resolved = true;
        used = true;
      }
      metadata.searchedPaths.push(path);
      metadata.envResolutionTrace.push({ source, path, exists, used });
    }
  }

  for (const key of [
    'OPENBAYES_GRAPHQL_ENDPOINT',
    'OPENBAYES_TOKEN',
    'OPENBAYES_GRAPHQL_CACHE_DIR',
    'OPENBAYES_PUBLIC_BASE_URL',
  ]) {
    if (processEnv[key]) {
      envValues[key] = processEnv[key];
      envSources[key] = `environment:${key}`;
    }
  }

  return { envValues, envSources, metadata };
}

// Rewrite URL strings in `data` whose host matches `internalEndpoint`'s host
// to use `publicBaseUrl`'s scheme+host. Returns a new tree; never mutates the
// input. No-op when either argument is missing or hosts already match.
//
// In-cluster deployments inject OPENBAYES_GRAPHQL_ENDPOINT as an internal
// service URL (e.g. http://openbayes-graphql-gateway/graphql). The GraphQL
// server then echoes that host back inside `Link.value`, producing URLs the
// user's browser cannot resolve. Setting OPENBAYES_PUBLIC_BASE_URL alongside
// the internal endpoint lets the script rewrite those outputs without
// changing the request path.
export function rewritePublicHost(value, { internalEndpoint, publicBaseUrl } = {}) {
  if (!internalEndpoint || !publicBaseUrl) return value;
  let internalUrl, publicUrl;
  try {
    internalUrl = new URL(internalEndpoint);
    publicUrl = new URL(publicBaseUrl);
  } catch {
    return value;
  }
  if (
    internalUrl.host === publicUrl.host &&
    internalUrl.protocol === publicUrl.protocol
  ) {
    return value;
  }
  return _walk(value, internalUrl.host, publicUrl);
}

function _walk(node, internalHost, publicUrl) {
  if (typeof node === 'string') {
    return _rewriteString(node, internalHost, publicUrl);
  }
  if (Array.isArray(node)) {
    return node.map((item) => _walk(item, internalHost, publicUrl));
  }
  if (node !== null && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = _walk(v, internalHost, publicUrl);
    }
    return out;
  }
  return node;
}

function _rewriteString(s, internalHost, publicUrl) {
  let parsed;
  try {
    parsed = new URL(s);
  } catch {
    return s;
  }
  if (parsed.host !== internalHost) return s;
  parsed.protocol = _pickScheme(parsed.protocol, publicUrl.protocol);
  parsed.hostname = publicUrl.hostname;
  parsed.port = publicUrl.port;
  return parsed.toString();
}

function _pickScheme(inputScheme, publicScheme) {
  if (inputScheme === 'ws:' || inputScheme === 'wss:') {
    return publicScheme === 'https:' ? 'wss:' : 'ws:';
  }
  return publicScheme;
}

export async function executeGraphQL({ endpoint, token, query, variables }) {
  const url = new URL(endpoint);
  const origin = `${url.protocol}//${url.host}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: normalizeToken(token),
      Origin: origin,
      Referer: `${origin}/`,
    },
    body: JSON.stringify({ query, variables: variables || {} }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }
  return response.json();
}
