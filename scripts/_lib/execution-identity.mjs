// Optional account assertions for CLI users and any Agent host. Not an approval
// token or a sandbox: callers still own intent, operation and parameter consent.
import { readFileSync, existsSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { executeGraphQL } from './graphql-core.mjs';

export const EXECUTION_IDENTITY_VERSION = 1;

// Verified facts (token fingerprint → username) are cached beside the session
// file so repeated invocations skip the online whoami. The cache stores facts,
// never consent: the expected-username assertion still decides every run.
const IDENTITY_CACHE_VERSION = 1;

export class ExecutionIdentityError extends Error {
  constructor(code) {
    super(code === 'EXECUTION_IDENTITY_CHANGED'
      ? `${code}: login changed during execution; an already sent operation may have run. Inspect before retrying.`
      : code);
    this.name = 'ExecutionIdentityError';
    this.code = code;
  }
}

function identityQuery() {
  // Installed package and canonical source checkout, never a cwd-selected file.
  const paths = [
    new URL('../../references/graphql-operations/common/whoami.graphql', import.meta.url),
    new URL('../graphql-operations/common/whoami.graphql', import.meta.url),
    new URL('../../graphql-operations/common/whoami.graphql', import.meta.url),
  ];
  const path = paths.find(path => existsSync(path));
  if (!path) throw new ExecutionIdentityError('IDENTITY_TEMPLATE_UNAVAILABLE');
  return readFileSync(path, 'utf8');
}

function identityCachePath(sessionFile) {
  return join(dirname(sessionFile), `${basename(sessionFile, '.json')}.identity-cache.json`);
}

function tokenFingerprint(token) {
  return createHash('sha256').update(token).digest('hex');
}

// The cache file lives beside the credentials, so a same-user process (or a
// prompt-confused agent) can edit it. Authenticating the cached fields with an
// HMAC keyed by the token means only the verification flow itself can produce
// a valid entry; forged or unsigned entries are misses, never authorization.
function identityMac(token, entry) {
  return createHmac('sha256', token)
    .update(`${entry.version}\n${entry.tokenFingerprint}\n${entry.endpoint}\n${entry.username}`)
    .digest('hex');
}

function identityMacMatches(token, entry) {
  const expected = Buffer.from(identityMac(token, entry));
  const provided = Buffer.from(typeof entry.mac === 'string' ? entry.mac : '');
  return provided.length === expected.length && timingSafeEqual(expected, provided);
}

// Any unreadable, malformed, stale, or unauthenticated cache is a miss: the
// caller re-verifies online and repairs the file. Cache failures never fail an
// execution.
function readIdentityCache(sessionFile, fingerprint, endpoint, token) {
  try {
    const cache = JSON.parse(readFileSync(identityCachePath(sessionFile), 'utf8'));
    const username = cache?.username;
    if (cache?.version === IDENTITY_CACHE_VERSION && cache.tokenFingerprint === fingerprint
      && cache.endpoint === endpoint && typeof username === 'string' && username
      && identityMacMatches(token, cache)) {
      return username;
    }
  } catch { /* miss */ }
  return null;
}

function writeIdentityCache(sessionFile, fingerprint, endpoint, username, token) {
  const path = identityCachePath(sessionFile);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    const entry = {
      version: IDENTITY_CACHE_VERSION,
      tokenFingerprint: fingerprint,
      endpoint,
      username,
    };
    const body = { ...entry, mac: identityMac(token, entry) };
    writeFileSync(temporary, `${JSON.stringify(body)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* nothing to clean */ }
    // A cache write failure only costs the next invocation a fresh whoami.
  }
}

/**
 * Snapshot the resolved credential source, verify identity for that token,
 * and fence subsequent work if logout/relogin changes it. No credential copies.
 * The verified username is cached per token fingerprint beside the session
 * file, so only a token change costs a fresh online whoami. Optional for
 * ordinary CLI usage; both assertions are required when opted in.
 * A post-request failure cannot roll back a server-side mutation.
 */
export function createExecutionIdentity({ resolution, resolveCurrent,
  expectedUsername, expectedEndpoint, request = executeGraphQL, signal } = {}) {
  if (expectedUsername === undefined && expectedEndpoint === undefined) {
    return { verify: async () => {}, assertCurrent() {} };
  }
  if (typeof expectedUsername !== 'string' || !expectedUsername.trim() || expectedUsername.length > 256
    || /[\x00-\x1f\x7f]/.test(expectedUsername) || typeof expectedEndpoint !== 'string') {
    throw new ExecutionIdentityError('INVALID_IDENTITY_ASSERTION');
  }
  let url;
  try { url = new URL(expectedEndpoint); }
  catch { throw new ExecutionIdentityError('INVALID_IDENTITY_ASSERTION'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new ExecutionIdentityError('INVALID_IDENTITY_ASSERTION');
  }
  const { OPENBAYES_TOKEN: token, OPENBAYES_GRAPHQL_ENDPOINT: endpoint } = resolution.envValues;
  const source = resolution.metadata.resolvedSessionFile;
  if (!token || !source) throw new ExecutionIdentityError('LOGIN_REQUIRED');
  if (endpoint !== expectedEndpoint) throw new ExecutionIdentityError('EXECUTION_ENDPOINT_MISMATCH');
  const assertCurrent = () => {
    if (signal?.aborted) throw new ExecutionIdentityError('EXECUTION_CANCELLED');
    const current = resolveCurrent();
    if (current.envValues.OPENBAYES_TOKEN !== token || current.envValues.OPENBAYES_GRAPHQL_ENDPOINT !== endpoint
      || current.metadata.resolvedSessionFile !== source) {
      throw new ExecutionIdentityError('EXECUTION_IDENTITY_CHANGED');
    }
  };
  return {
    assertCurrent,
    async verify() {
      assertCurrent();
      const fingerprint = tokenFingerprint(token);
      let username = readIdentityCache(source, fingerprint, endpoint, token);
      if (username === null) {
        let result;
        try { result = await request({ endpoint, token, query: identityQuery(), signal }); }
        catch { assertCurrent(); throw new ExecutionIdentityError('IDENTITY_UNAVAILABLE'); }
        assertCurrent();
        if (result?.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length)) {
          throw new ExecutionIdentityError('IDENTITY_UNAVAILABLE');
        }
        username = typeof result?.data?.me?.username === 'string' ? result.data.me.username : null;
        // The token → username mapping is a verified fact; cache it even when
        // it does not match the assertion, so future runs fail without a call.
        if (username !== null) writeIdentityCache(source, fingerprint, endpoint, username, token);
      }
      if (username !== expectedUsername) {
        throw new ExecutionIdentityError('EXECUTION_USERNAME_MISMATCH');
      }
    },
  };
}
