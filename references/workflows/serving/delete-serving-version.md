# Delete Serving Version

Use this workflow when the user wants to permanently delete a serving version.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Safely delete a serving version after confirming the target.

## Prerequisites

The serving version should be stopped first. If it is still running, redirect to `references/workflows/serving/stop-serving-version.md`.

## Deterministic Steps

1. Load current serving version state with `serving/serving-read-version.graphql`.
2. Verify the version is stopped (not running).
3. Restate the exact target: serving id, version number, current status.
4. Ask for explicit confirmation.
5. Execute `serving/serving-version-delete.graphql`.
6. Read back to verify the version no longer exists.
7. If there is doubt about whether the endpoint is still serving traffic, verify with `references/workflows/serving/read-serving-status.md`.

## Confirmation

This is a destructive and irreversible operation. Before execution:

1. Restate the exact target (serving id, version number).
2. Explain that this permanently removes the version.
3. Wait for explicit user confirmation.
4. After execution, perform read-back verification.

## Rollback Context

This is typically the second step in a rollback sequence:

1. `stopServingVersion` (`references/workflows/serving/stop-serving-version.md`)
2. `deleteServingVersion` (this workflow)
3. `deleteServing` (`references/workflows/serving/delete-serving.md`) — if full cleanup is requested

## Guardrails

- Never delete a running version without stopping it first.
- Never delete without explicit confirmation.
- Never invent a fixed post-delete data-plane probe; defer probe choice to `references/workflows/serving/read-serving-status.md`.

## GraphQL Operations

- `references/graphql-operations/serving/serving-version-delete.graphql`
- `references/graphql-operations/serving/serving-read-version.graphql`
