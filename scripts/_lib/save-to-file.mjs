// Helpers for `run_graphql.sh --save-to[-default]` mode: extract a stable
// operation name from the query, build the stdout descriptor that replaces
// the inline data payload, and resolve the file path the saved JSON lands at.
//
// All exports are pure functions; the tiny FS-touching glue (mkdir + write)
// lives in run_graphql.mjs so this module stays unit-testable without
// monkey-patching node:fs.

import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_CACHE_DIR_NAME = 'openbayes-graphql';

/**
 * Pull the named operation out of a GraphQL document, falling back to the
 * operation type for anonymous documents (`query { me { id } }` →
 * `"query"`). The result is used both as the descriptor's `operation` field
 * and as the filename stem under `--save-to-default`.
 */
export function extractOperationName(queryText) {
  const stripped = queryText
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
  const named = stripped.match(
    /\b(query|mutation|subscription)\s+([A-Za-z_][A-Za-z_0-9]*)/i,
  );
  if (named) return named[2];
  const anon = stripped.match(/\b(query|mutation|subscription)\b/i);
  if (anon) return anon[1].toLowerCase();
  return 'query';
}

/**
 * DFS for the first array reached from `value`, descending through plain
 * objects up to `maxDepth` levels. Used to surface the canonical "list of
 * rows" out of typical paginated wrapper shapes (`{user:{projects:{data:[...]}}}`)
 * for the descriptor's `rows` and `preview.fields`.
 *
 * Returns `null` when the response has no array root anywhere in reach.
 */
export function findPrimaryArray(value, maxDepth = 5) {
  function walk(node, depth) {
    if (Array.isArray(node)) return node;
    if (depth >= maxDepth) return null;
    if (node && typeof node === 'object') {
      for (const v of Object.values(node)) {
        const found = walk(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(value, 0);
}

/**
 * Build the structured descriptor that replaces the data payload on stdout
 * when save mode is active. Shape:
 *
 *   { saved_to, operation, operation_type, size_bytes, shape,
 *     rows?, preview?: { fields, first } }
 *
 * `rows`/`preview` are only set when a primary array of objects was found;
 * scalar / pure-object responses get a leaner descriptor.
 */
export function buildDescriptor({
  data,
  savedPath,
  operation,
  operationType,
  sizeBytes,
}) {
  let shape;
  if (Array.isArray(data)) shape = 'array';
  else if (data && typeof data === 'object') shape = 'object';
  else shape = 'scalar';

  const descriptor = {
    saved_to: savedPath,
    operation,
    operation_type: operationType,
    size_bytes: sizeBytes,
    shape,
  };

  const primary = findPrimaryArray(data);
  if (primary && primary.length > 0) {
    const fields = new Set();
    for (const row of primary.slice(0, 5)) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        for (const k of Object.keys(row)) fields.add(k);
      }
    }
    descriptor.rows = primary.length;
    if (fields.size > 0) {
      descriptor.preview = {
        fields: [...fields],
        first: primary[0],
      };
    }
  } else if (primary) {
    descriptor.rows = 0;
  }

  return descriptor;
}

/**
 * Compact UTC timestamp suitable for embedding in filenames:
 * `2026-05-07T10:32:55.123Z` → `20260507-103255`.
 */
export function formatTimestamp(date) {
  const iso = date.toISOString();
  const [d, t] = iso.split('T');
  return `${d.replace(/-/g, '')}-${t.replace(/[:.]/g, '').slice(0, 6)}`;
}

/**
 * Decide where the file should land. Precedence:
 *
 *   1. `--save-to <path>` → that exact absolute path
 *   2. `--save-to-default` → `${OPENBAYES_GRAPHQL_CACHE_DIR ?? <tmp>}/<op>-<ts>.json`
 *   3. neither → `null` (caller stays on the inline path)
 *
 * `now` is injectable so tests get deterministic filenames.
 */
export function resolveSaveTarget({ args, envValues = {}, operation, now }) {
  if (args['save-to'] && args['save-to-default']) {
    throw new Error(
      'INVALID_INPUT: --save-to and --save-to-default are mutually exclusive.',
    );
  }
  if (args['save-to']) return resolve(args['save-to']);
  if (args['save-to-default']) {
    const cacheDir =
      envValues.OPENBAYES_GRAPHQL_CACHE_DIR ||
      join(tmpdir(), DEFAULT_CACHE_DIR_NAME);
    const ts = formatTimestamp(now ?? new Date());
    return join(cacheDir, `${operation}-${ts}.json`);
  }
  return null;
}
