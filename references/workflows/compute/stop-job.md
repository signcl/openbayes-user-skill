# Stop Job

Use this workflow when the user wants to stop a running or pending job.

## Goal

Safely execute `stopJob` only after verifying the target job and current state.

## Main Entity

- Primary entity: `Job`

## Required Reads

Load the current `Job` snapshot via `compute/load-job-context.graphql`.

## Action Gates

Check these before stopping:

1. target job must be visible to the current user
2. `job.canStop` when available is the primary stop affordance
3. current status must still be stoppable in product terms
4. for a RUNNING workspace, stop only with active-work ownership/takeover confirmation or read-only evidence that it is idle

## Deterministic Steps

1. Normalize the request into `job.stop`.
2. Require:
   - `userId`
   - `jobId`
3. Load `compute/load-job-context.graphql`.
4. Check:
   - the job is visible to the current user
   - the job is in a stoppable state
   - `canStop` is true when available
   - for `mode=WORKSPACE` and `status=RUNNING`, the current task is allowed to take over or terminate the workspace
5. Restate the exact target:
   - job id
   - current mode
   - current status
6. Ask for confirmation.
7. Execute `compute/stop-job.graphql` with user scope only.
8. Optionally reload `compute/load-job-context.graphql` to confirm the new status.
9. Explain the result in product language.

## Confirmation

This is a destructive operation. Before execution:

1. Restate the exact target (job id, name, current status, mode).
2. Explain that stopping will terminate the running compute session.
3. Wait for explicit user confirmation.
4. After execution, perform read-back verification to confirm the effect.

## Guardrails

- Do not use `updateJob` as a stop mechanism.
- Do not stop a job if the user intent is ambiguous.
- Missing `links.sandbox`, empty `/input*`, or suspected binding issues are investigation signals, not stop authorization.
- If other work may be active, inspect read-only or offer a new workspace.
- Do not claim success from the mutation alone when a read-back is easy to perform.

## Read-Back

After mutation, reload the same job and summarize:

- job id and mode
- previous status versus current status
- whether the job is now stopping, cancelling, or already terminated

## Failure Translation

- permission denied -> the current user cannot stop this job
- invalid state -> the job is already stopped or cannot be stopped from its current state

## GraphQL Operations

- `references/graphql-operations/compute/stop-job.graphql`
- `references/graphql-operations/compute/load-job-context.graphql`
