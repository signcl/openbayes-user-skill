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
        pretty: { type: 'boolean', default: false },
        'save-to': { type: 'string' },
        'save-to-default': { type: 'boolean', default: false },
        'check-update': { type: 'boolean', default: false },
      },
      strict: true,
    });
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
  if (args['ssl-verify'] != null) return args['ssl-verify'] === 'true';
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
    warnings: metadata.warnings,
    user_config_dir: metadata.userConfigDir,
  };
}

// `--identity` answers "which account would this invocation act as" without
// sending anything. It MUST share resolveEnv with the request path below —
// a separate resolver would drift and stop reproducing the very override it
// exists to expose (an exported OPENBAYES_TOKEN beating --env-file).
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
      `Missing OPENBAYES_TOKEN. Pass --env-file, set OPENBAYES_TOKEN in the environment, or configure ${metadata.userConfigDir}/.env.${args.vendor}.`,
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

async function main() {
  const args = parseCliArgs();
  if (args.identity) emitIdentity(args);
  if (args['check-update']) await emitUpdateCheck(args);

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

  const endpoint =
    envValues.OPENBAYES_GRAPHQL_ENDPOINT || DEFAULT_ENDPOINTS[args.vendor] || null;
  if (!endpoint) {
    fail(
      'MISSING_ENDPOINT',
      'Missing OPENBAYES_GRAPHQL_ENDPOINT. Set the environment variable or configure the user-level .env.<vendor> file.',
      { detail: buildResolutionDetail(args.vendor, metadata) },
    );
  }

  const token = envValues.OPENBAYES_TOKEN;
  if (!token) {
    fail(
      'MISSING_TOKEN',
      `Missing OPENBAYES_TOKEN. Pass --env-file, set OPENBAYES_TOKEN in the environment, or configure ${metadata.userConfigDir}/.env.${args.vendor}.`,
      { detail: buildResolutionDetail(args.vendor, metadata) },
    );
  }
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
