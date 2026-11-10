# Delete Serving

Use this workflow when the user wants to permanently delete an entire serving.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Safely delete an entire serving (all versions) after confirming the target.

## Prerequisites

All serving versions should be stopped and deleted first. If any version is still running, redirect to the rollback sequence:

1. `references/workflows/serving/stop-serving-version.md`
2. `references/workflows/serving/delete-serving-version.md`

## Deterministic Steps

1. Load current serving state with `serving/serving-read-overview.graphql`.
2. Verify all versions are stopped/deleted.
3. Restate the exact target: serving id, name, number of versions.
4. Ask for explicit confirmation.
5. Execute `serving/serving-delete.graphql`.
6. Read back to verify the serving no longer exists (expect not-found).
7. If the user asks whether the external endpoint has fully disappeared, verify using `references/workflows/serving/read-serving-status.md`.

## Confirmation

This is a destructive and irreversible operation. Before execution:

1. Restate the exact target (serving id, name).
2. Explain that this permanently removes the serving and all its configuration.
3. Wait for explicit user confirmation.
4. After execution, perform read-back verification to confirm not-found.

## Rollback Context

This is typically the final step in a full cleanup sequence:

1. `stopServingVersion` (`references/workflows/serving/stop-serving-version.md`)
2. `deleteServingVersion` (`references/workflows/serving/delete-serving-version.md`)
3. `deleteServing` (this workflow)

## Guardrails

- Never delete a serving with running versions.
- Never delete without explicit confirmation.
- Never skip read-back verification.
- Never invent a fixed final-disappearance probe; defer probe choice to `references/workflows/serving/read-serving-status.md`.

## GraphQL Operations

- `references/graphql-operations/serving/serving-delete.graphql`
- `references/graphql-operations/serving/serving-read-overview.graphql`
