# Stop Serving Version

Use this workflow when the user wants to stop a running serving version.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Safely stop a running serving version after confirming the target.

## Deterministic Steps

1. Load current serving version state with `serving/serving-read-version.graphql`.
2. Verify the version is in a stoppable state.
3. Restate the exact target: serving id, version number, current status.
4. Ask for explicit confirmation.
5. Execute `serving/serving-version-stop.graphql`.
6. Read back to verify the version is stopped.
7. If the user asks whether traffic has fully drained or whether the endpoint is still reachable, use `references/workflows/serving/read-serving-status.md` to confirm the post-stop state.

## Confirmation

This is a destructive operation. Before execution:

1. Restate the exact target (serving id, version number, current status).
2. Explain that stopping will terminate the serving endpoint for this version.
3. Wait for explicit user confirmation.
4. After execution, perform read-back verification to confirm the effect.

## Rollback Context

This is typically the first step in a rollback sequence:

1. `stopServingVersion` (this workflow)
2. `deleteServingVersion` (`references/workflows/serving/delete-serving-version.md`)
3. `deleteServing` (`references/workflows/serving/delete-serving.md`) — if full cleanup is requested

## Guardrails

- Never stop without explicit confirmation.
- Never skip read-back verification.
- Never invent a fixed data-plane probe; defer probe choice to `references/workflows/serving/read-serving-status.md`.

## GraphQL Operations

- `references/graphql-operations/serving/serving-version-stop.graphql`
- `references/graphql-operations/serving/serving-read-version.graphql`
