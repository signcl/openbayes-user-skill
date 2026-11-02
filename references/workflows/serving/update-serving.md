# Update Serving

Use this workflow when the user wants to update serving-level settings.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Update serving-level configuration (e.g., name, description, settings).

## Required Reads

Before mutation, load:

- current serving state with `serving/serving-read-overview.graphql`
- current serving version state when the update may affect endpoint behavior, access policy interpretation, or rollout context

## Deterministic Steps

1. Load current serving state with `serving/serving-read-overview.graphql`.
2. If the update touches rollout-relevant settings, keep serving invariants in mind:
   - apply the binding and startup invariants from `references/workflows/serving/preflight-from-job.md`
   - runtime/resource drift should be handled through serving-version workflows, not silently here
3. Restate the target serving id and the exact changes.
4. Ask for confirmation.
5. Execute `serving/serving-update.graphql`.
6. Read back to verify the update.

## Guardrails

- Always confirm before mutation.
- Always read-back after write.
- Never assume a serving-level metadata update proves endpoint readiness; use `references/workflows/serving/read-serving-status.md` when the user asks whether the service is actually healthy.

## GraphQL Operations

- `references/graphql-operations/serving/serving-update.graphql`
- `references/graphql-operations/serving/serving-read-overview.graphql`
