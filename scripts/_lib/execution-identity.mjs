// Optional account assertions for CLI users and any Agent host. Not an approval
// token or a sandbox: callers still own intent, operation and parameter consent.
import { readFileSync, existsSync } from 'node:fs';
import { executeGraphQL } from './graphql-core.mjs';

export const EXECUTION_IDENTITY_VERSION = 1;

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

/**
 * Snapshot the resolved credential source, verify online with that same token,
 * and fence subsequent work if logout/relogin changes it. No credential copies.
 * Optional for ordinary CLI usage; both assertions are required when opted in.
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
      let result;
      try { result = await request({ endpoint, token, query: identityQuery(), signal }); }
      catch { assertCurrent(); throw new ExecutionIdentityError('IDENTITY_UNAVAILABLE'); }
      assertCurrent();
      if (result?.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length)) {
        throw new ExecutionIdentityError('IDENTITY_UNAVAILABLE');
      }
      if (result?.data?.me?.username !== expectedUsername) {
        throw new ExecutionIdentityError('EXECUTION_USERNAME_MISMATCH');
      }
    },
  };
}
