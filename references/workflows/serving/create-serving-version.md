# Create Serving Version

Use this workflow to roll out a new version of an existing serving — typically because the source workspace's `/output` changed, or the user wants a different `runtime` / `resource` / `replica` for the next deploy.

## Not for: restart a stopped version

If the user just wants to bring a `CANCELLED` or `FAILED` version back online with **the same config**, that is **not** a new version — `ServingVersion` is immutable and the platform supports restart via `updateServingVersion(input: {replica: <currentReplica>})`. Use `references/workflows/serving/restart-serving.md`. Wasting a version number on a config-identical restart breaks version-pinned monitoring and consumers.

If unsure whether the user wants restart or new version, ask.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Create a new version for an existing serving, allowing rollout of updated runtime, bindings, or configuration.

## Main Entity

- Primary aggregate root: `Serving`
- Created runtime sub-entity: `ServingVersion`
- Optional source context: `Job`

## Prerequisites

Run `references/workflows/serving/preflight-from-job.md` first if the source job context has changed. The same hard rules apply:

- Resource must match the source job (Serving 与 Job 共用同一份 resource 目录，按 `name` 选即可)。
- Bindings and startup requirements must satisfy the preflight rules.

## Required Reads

Before mutation, have these reads in hand:

- party context
- current `Serving` overview
- source `Job` context when rollout is derived from an existing job
- candidate resource catalog queried with the shared resource catalog template
- candidate runtime catalog queried with the same runtime list shape used by job creation

## Action Gates

Check these before creating the version:

- `party.features` contains `SERVING`
- `serving.canCreateVersion` when available
- preflight passed for resource, runtime, bindings, and startup script
- target resource still passes current limitation and availability checks

## Deterministic Steps

1. Ensure preflight has been completed.
2. Run limitations check per `references/workflows/common/check-limitations.md`:
   - Resource parallel limit for the target resource.
3. If preflight marked a mandatory source-workspace stop, stop the source workspace and wait for it to be fully stopped before creating the version.
4. Build serving version input (same rules as `create-serving`). When constructing `dataBindings[]` by hand, follow [ServingDataBindingInput fields](./create-serving.md#servingdatabindinginput-fields) — `name` holds the data reference, `path` holds the mount path; that asymmetry is the root of the most common "无效绑定目录" failure.
5. Restate the serving id, new version configuration, and ask for confirmation.
6. Execute `serving/serving-version-create.graphql`.
7. Continue to `references/workflows/serving/read-serving-status.md` for readiness verification.

## Guardrails

- Never create a version without running preflight.
- Never skip confirmation.
- Never use a different resource than the source job.
- Never violate the handoff decision produced by preflight for source-workspace stop versus direct rollout.

## Read-Back

After mutation, continue to `references/workflows/serving/read-serving-status.md` and report:

- serving id
- new serving-version id or version number
- rollout status and instance readiness
- endpoint links and probe result

## GraphQL Operations

- `references/graphql-operations/serving/serving-version-create.graphql`
- `references/graphql-operations/common/load-shared-resource-catalog.graphql`
- `references/graphql-operations/common/load-job-runtime-catalog.graphql`

## Failure Translation

- permission denied -> the current user cannot create a serving version
- resource unavailable -> the target resource is full or unaffordable
- parallel limit exceeded -> user has reached their concurrent container limit for this resource
