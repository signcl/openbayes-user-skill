# Manage API Keys

Use this workflow for serving API key lifecycle: create, list, update, and revoke.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Manage API keys for a serving, including creation, listing, permission updates, and revocation.

## Operations

### Create API Key

1. Restate the serving id and key configuration.
2. Ask for confirmation.
3. Execute `serving/serving-apikey-create.graphql`.
4. The mutation returns a bare `String` — the plaintext secret itself, with no id, name, or status wrapper. Print it in full and unmasked in your reply, and tell the user to save it now: this is the only time the platform returns it.
5. If `createApiKey` returns `null` with no GraphQL errors, treat it as failure, not silent success (see `references/graphql-discipline.md`). Do not tell the user a key was created.
6. Verify with `serving/serving-apikey-list.graphql` — for metadata only (id, name, bindings). The `key` value there is not the secret; never re-present it as one.

### List API Keys

1. Execute `serving/serving-apikey-list.graphql`.
2. Display key ids, names, and permission levels. Do not present the `key` value as a usable secret — the platform does not return the full key again after creation.
3. No confirmation required (read-only).

### Update API Key

1. Restate the key id and intended permission changes.
2. Ask for confirmation.
3. Execute `serving/serving-apikey-update.graphql`.
4. Verify with `serving/serving-apikey-list.graphql`.

### Revoke API Key

1. Restate the key id and name.
2. Ask for explicit confirmation (destructive operation).
3. Execute `serving/serving-apikey-revoke.graphql`.
4. Verify with `serving/serving-apikey-list.graphql`.

## Confirmation

Revoke is destructive. Before revoking:

1. Restate the exact key id and name.
2. Explain that revocation is irreversible.
3. Wait for explicit user confirmation.
4. After execution, verify the key no longer appears in the list.

## Guardrails

- Always confirm before create, update, and revoke.
- Always verify with list after any mutation. For create, the list confirms the key's metadata only — never its secret.
- Treat API key values as sensitive. One exception: the plaintext returned by `createApiKey` must be printed in full in that one reply, because the platform never returns it again. Everywhere else — the `apiKeys` list, the `apiKey` query — never present the returned `key` as a usable secret.

## GraphQL Operations

- `references/graphql-operations/serving/serving-apikey-create.graphql`
- `references/graphql-operations/serving/serving-apikey-list.graphql`
- `references/graphql-operations/serving/serving-apikey-update.graphql`
- `references/graphql-operations/serving/serving-apikey-revoke.graphql`
