# Restart Job

Use this workflow when the user wants to restart an existing workspace.

**Workspace mode only** (supported-mode policy: `SKILL.md` → "Compute Create Routing"). If the target job is any other mode, stop and tell the user instead of reaching for a restart mutation.

## Goal

Validate any overrides against the current job, then restart it.

## Main Entity

- Primary entity: `Job`
- Project context when inherited settings matter: `Project`
- Binding context when bindings change: `DatasetVersion`

## Required Reads

Read the current job first, then only load extra context if the user wants overrides:

- current `Job` snapshot via `compute/load-job-context.graphql`
- resource catalog when resource override is requested
- runtime catalog when runtime override is requested
- quota view when resource or runtime override is requested
- dataset-version context when bindings change

## Payload Shape

Input shape for `restartWorkspace` — field table, what `CreateJobInput` has that
restart does **not**, Secret-parameter handling, worked `vars.json` — is in
`references/graphql-operations/compute/restart-workspace.vars.md`.

As with create, `runtime` and `resource` are **`String!`**, not the objects the
job context returns. Reconstruct the whole input from `load-job-context.graphql`
and layer overrides on top; do not send a delta.

## What Counts as "Stopped"

The guardrail below ("never restart a workspace that has not been stopped yet")
turns on the job's current status. **Prefer `Job.canStart`** — it is the
platform's own affordance and already folds in whatever else gates the
transition. `load-job-context.graphql` (step 2) selects it, so it is always
available on this path; the list queries (`load-my-jobs`, `load-project-jobs`)
do not. Use this table to explain *why* to the user, and when you only have a
list view:

| `Job.status` | Restart? |
|---|---|
| `CANCELLED` | ✅ The normal post-stop resting state — a user stop lands here (usually `subStatus: TERMINATED`, `canStart: true`) |
| `CANCELLING` | ⏳ Still shutting down — wait for `CANCELLED`, then restart |
| `RUNNING` | ❌ Apply the RUNNING workspace guard (gate 6 below). Do not auto-stop |
| `CREATED`, `QUEUED` | ❌ Already starting — nothing to restart |
| `FAILED`, `SUCCEEDED` | Defer to `canStart` — terminal, but not how a stopped workspace normally rests |

`subStatus` is diagnostic, not a gate: `TERMINATED` (user stop) and
`QUOTA_EXHAUSTED` (debt eviction) are both `CANCELLED`. A `QUOTA_EXHAUSTED` job
will re-evict until the balance is fixed — say so before restarting.

## Action Gates

Check these before restarting:

1. the job's mode must be `WORKSPACE` (see the scope note at the top)
2. `job.canStart` when available should be treated as the direct restart affordance (see "What Counts as Stopped" above)
3. for every new or changed dataset binding: `datasetVersion.isDeleted` is false and user has read access; writable needs `canBeBoundWithWritePermission`. Do **not** gate on `canBindJob` (model-serving only, see `clone-tutorial.md`).
4. `party.limitations` checks from `references/workflows/common/check-limitations.md`
5. resource availability and runtime validation for any override
6. RUNNING workspace guard: restart only after explicit active-work ownership/takeover confirmation; otherwise inspect read-only or create a new workspace.

## Deterministic Steps

1. Normalize the request into `job.restart.workspace`.
2. Load `compute/load-job-context.graphql`.
3. Confirm the job's mode is `WORKSPACE`. Any other mode is out of scope — stop and tell the user.
4. If the target is running/starting, do not auto-stop. Apply the RUNNING workspace guard, then stop/wait only after explicit takeover confirmation.
5. Run limitations check per `references/workflows/common/check-limitations.md`:
   - Resource parallel limit for the target resource.
6. If the user requested overrides for runtime, resource, bindings, or ports:
    - reload `common/load-resource-catalog.graphql`
    - reload `common/load-runtime-catalog.graphql`
    - reload `common/load-quota.graphql`
    - reload `dataset/load-dataset-context.graphql` when bindings change
7. For any path-sensitive follow-up (for example bindings, `start.sh`, or model mount checks), inspect workspace SSH context first:
   - follow `references/workflows/common/ssh-best-practice.md`
   - verify default workdir (`pwd`) and path aliases (`/output`, `/input0`, `/<prefix>/home`, `/<prefix>/input/input0`)
   - infer `<prefix>` from the default workdir when needed
8. Normalize any vendor-prefixed binding paths from job context (for example `/<prefix>/home`, `/<prefix>/input/input*`) to canonical `/output` and `/input*`.
9. Reconstruct the restart input from current job context plus confirmed overrides.
10. For workspace reuse tasks such as reading an existing `/output/start.sh`, prefer reconfiguring and restarting the existing workspace instead of creating a new temporary workspace.
11. Restate:
   - job id
   - current mode
   - effective runtime
   - effective resource
   - effective bindings
   - effective ports
12. Ask for confirmation.
13. Execute the mode-matched restart mutation with user scope only.
14. Load `compute/load-job-context.graphql` again for the same job id.
15. Normalize GraphQL-returned binding paths before presenting them in summaries.
16. Summarize the returned job: id, mode, status, project, `links.ssh`, `links.workspace` / `links.workspace-with-password`, `links.frontend`, and `links.auxiliary` when present. For workspace-mode jobs, follow `references/ui-links.md` for which link to surface and how to handle `Job.password` (Jupyter token + SSH password).
17. If remote shell follow-up is requested via `links.ssh`, follow `references/workflows/common/ssh-best-practice.md`.

## Environment Variables on Restart

`restartWorkspace` carries `parameters` (the env-var mechanism; see `create-job.md`). Job context returns each as `{ name, value, isSecret }`, and Secret values come back **redacted**.

- To keep a Secret unchanged, reference it by `name` with `isSecret: true` and send no value — the platform backfills the original value server-side. Never copy the redacted/masked value back into the restart input.
- To change a Secret, send the same `name` with the new `value` and `isSecret: true`.
- Plain-text parameters are reconstructed and carried over as-is.

See `references/openbayes-docs/gear/env-vars.md` for the product behavior (quick-start backfill vs modify-and-start "替换").

## Guardrails

- Never guess the restart mutation from user wording alone. Always read the job first.
- Never copy a redacted Secret value back into the restart input. Keep a Secret by name with `isSecret: true` and no value, or replace it with a new value.
- Never apply runtime or resource overrides without re-validating quota and availability.
- Never attempt `restartWorkspace` against a workspace that has not been stopped yet.
- Missing `links.sandbox`, empty `/input*`, missing files, or binding suspicion do not make a RUNNING workspace safe to interrupt.

## Read-Back

After mutation, reload the same job and summarize:

- job id and mode
- status and substatus
- effective runtime and resource
- effective bindings and ports
- access links such as `links.ssh`, `links.workspace` / `links.workspace-with-password`, and `links.frontend` (see `references/ui-links.md` for handling and `Job.password` semantics)

## Failure Translation

- wrong mode -> this restart path does not match the current job type
- quota error -> the requested restart configuration exceeds current quota
- resource error -> the requested compute resource is unavailable
- runtime error -> the selected runtime is unavailable or deprecated
- parallel limit exceeded -> user has reached their concurrent container limit for this resource

## GraphQL Operations

- `references/graphql-operations/compute/restart-workspace.graphql` (+ `restart-workspace.vars.md` — `RestartWorkspaceInput` shape, stopped-state gate, worked payloads)
- `references/graphql-operations/compute/load-job-context.graphql`
- `references/graphql-operations/common/load-resource-catalog.graphql`
- `references/graphql-operations/common/load-runtime-catalog.graphql`
- `references/graphql-operations/common/load-quota.graphql`
