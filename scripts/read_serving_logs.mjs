#!/usr/bin/env node
// User-only read command. Credentials stay inside the existing session resolver.
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolveEnv, normalizeToken } from './_lib/graphql-core.mjs';

const MAX_BYTES = 1024 * 1024;

function parseUrl(value) {
  try { return new URL(value); }
  catch { throw new Error('Invalid endpoint or log URL.'); }
}

function positiveInt(value, name, max) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}.`);
  }
  return Number(value);
}

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: normalizeToken(token), Origin: parseUrl(url).origin,
      'Content-Type': 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Do not echo upstream bodies: proxies can reflect request credentials.
    throw new Error(`HTTP ${response.status}; check login, permissions and service availability.`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('Response exceeds 1 MiB; narrow the time window or tail.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Expected a JSON response.'); }
}

async function sampleLive(link, { version, tail, seconds }) {
  if (typeof globalThis.WebSocket !== 'function') throw new Error('Live logs require Node.js 22+; history supports Node.js 18+.');
  const url = parseUrl(link);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/.meta/livelog' || url.search || url.hash) {
    throw new Error('Unsafe live link: expected a credential-free /.meta/livelog URL.');
  }
  return new Promise((resolve, reject) => {
    // Match the console: native WebSocket, no Authorization, cookies or token URL.
    // Native WebSocket fails redirects instead of following them.
    const ws = new WebSocket(url);
    const logs = [];
    let opened = false, done = false, size = 0, ignored = 0;
    const finish = (reason, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ws.close();
      if (error) reject(new Error(error));
      else resolve({ logs, stop_reason: reason, ignored_messages: ignored });
    };
    const timer = setTimeout(() => finish('duration', opened ? null : 'Live connection timed out before opening.'), seconds * 1000);
    ws.addEventListener('open', () => { opened = true; });
    ws.addEventListener('error', () => finish(null, 'Live connection failed; check serving status and deployment routing.'));
    // 1000 and 1005 (no status code) are clean; others fail even if wasClean,
    // which is true for any completed handshake including a 1011 server error.
    ws.addEventListener('close', event => finish('closed', event.code === 1000 || event.code === 1005 ? null : 'Live connection closed abnormally; sample is incomplete.'));
    ws.addEventListener('message', event => {
      if (done) return;
      if (typeof event.data !== 'string') return finish(null, 'Unexpected binary live log frame.');
      size += Buffer.byteLength(event.data);
      if (size > MAX_BYTES) return finish('byte-limit');
      let row;
      try { row = JSON.parse(event.data); }
      catch { return finish(null, 'Unexpected non-JSON live log frame.'); }
      if (row?.version !== `v${version}`) { ignored++; return; }
      if (typeof row.log !== 'string' || typeof row.time !== 'string') return finish(null, 'Unexpected live log response shape.');
      logs.push(row);
      if (logs.length >= tail) finish('tail');
    });
  });
}

async function main() {
  const { values: args } = parseArgs({ options: {
    vendor: { type: 'string', default: 'openbayes' },
    'env-file': { type: 'string' }, 'ssl-verify': { type: 'string' },
    username: { type: 'string' }, id: { type: 'string' }, version: { type: 'string' },
    from: { type: 'string', default: '-30m' }, to: { type: 'string', default: 'now' },
    tail: { type: 'string', default: '100' },
    live: { type: 'boolean', default: false }, seconds: { type: 'string', default: '10' },
  }, strict: true });
  if (!args.username || !args.id) throw new Error('--username and --id are required.');
  const version = positiveInt(args.version ?? '', '--version', 2147483647);
  const tail = positiveInt(args.tail, '--tail', 1000);
  const seconds = positiveInt(args.seconds, '--seconds', 60);
  const { envValues, metadata } = resolveEnv({ envFile: args['env-file'], vendor: args.vendor,
    cwd: process.cwd(), homeDir: homedir(), processEnv: process.env });
  if (metadata.explicitEnvFileMissing) throw new Error('ENV_FILE_NOT_FOUND');
  if (args['ssl-verify'] != null && !['true', 'false'].includes(args['ssl-verify'])) {
    throw new Error('--ssl-verify must be true or false.');
  }
  const sslSetting = args['ssl-verify'] ?? envValues.OPENBAYES_SSL_VERIFY ?? 'true';
  // Same explicit opt-out as run_graphql; never retry with verification off.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = ['0', 'false', 'no', 'off'].includes(sslSetting.trim().toLowerCase()) ? '0' : '1';
  const token = envValues.OPENBAYES_TOKEN;
  if (!token) throw new Error(`MISSING_TOKEN: run run_graphql.sh --login --vendor ${args.vendor}.`);
  const endpoint = parseUrl(envValues.OPENBAYES_GRAPHQL_ENDPOINT);
  const query = readFileSync(new URL('../references/graphql-operations/serving/serving-log-context.graphql', import.meta.url), 'utf8');
  const context = await requestJson(endpoint, token, { method: 'POST', body: JSON.stringify({
    query, variables: { username: args.username, id: args.id, version },
  }) });
  if (context.errors?.length) throw new Error('GraphQL context query failed; no logs requested.');
  const { serving, servingVersion } = context.data ?? {};
  if (serving?.id !== args.id || serving?.owner?.id !== args.username ||
      servingVersion?.servingId !== args.id || servingVersion?.version !== version) {
    throw new Error('Serving/version is unavailable or does not match the requested owner and id.');
  }
  if (args.live) {
    if (!servingVersion.live) throw new Error('No live link for this version; use history, do not restart it.');
    const sample = await sampleLive(servingVersion.live, { version, tail, seconds });
    return { mode: 'live', owner: args.username, id: args.id, version, seconds, tail, ...sample };
  }
  const link = serving.links?.find(link => link.name === 'log')?.value;
  // Measured on two deployments: the log API sits at
  // <origin>/serving-metrics/logs/<owner>/<servingId>, and one deployment publishes
  // no `log` link at all. Deriving keeps the same-origin rule; a deployment
  // serving logs elsewhere must publish the link.
  const derived = new URL(`/serving-metrics/logs/${encodeURIComponent(args.username)}/${encodeURIComponent(args.id)}`, endpoint.origin);
  const logSource = link ? 'serving.links' : 'derived';
  if (!link && args.live) throw new Error('No historical log link is available.');
  const url = link ? parseUrl(link) : derived;
  // Old controllers advertise http on an https console. Upgrade only the same
  // hostname on default ports; never downgrade or send credentials cross-origin.
  if (url.protocol === 'http:' && endpoint.protocol === 'https:' &&
      url.hostname === endpoint.hostname && !url.port && !endpoint.port) url.protocol = 'https:';
  const expectedPath = `/serving-metrics/logs/${encodeURIComponent(args.username)}/${encodeURIComponent(args.id)}`;
  if (url.origin !== endpoint.origin || url.pathname !== expectedPath || url.username || url.password) {
    throw new Error('Unsafe log link: expected the session origin and serving log path.');
  }
  url.search = '';
  url.hash = '';
  for (const [key, value] of Object.entries({ from: args.from, to: args.to, tail, version: `v${version}` })) {
    url.searchParams.set(key, String(value));
  }
  const logs = await requestJson(url, token);
  if (!Array.isArray(logs) || logs.some(row => typeof row?.log !== 'string' || typeof row?.time !== 'string')) {
    throw new Error('Unexpected historical log response shape.');
  }
  return { mode: 'history', owner: args.username, id: args.id, version, log_source: logSource,
    from: args.from, to: args.to, tail, logs };
}

try {
  // Flush output before exiting, without waiting for a peer's close handshake.
  process.stdout.write(JSON.stringify(await main()) + '\n', () => process.exit(0));
} catch (error) {
  process.stderr.write(`[SERVING_LOGS] ${error.message}\n`, () => process.exit(1));
}
