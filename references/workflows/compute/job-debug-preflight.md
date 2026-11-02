# Job Debug Preflight

Use this workflow when a normal user asks why a job failed to start or why a proposed job might fail before creation.

## Goal

Turn low-level GraphQL and catalog signals into a short human-readable diagnosis.

## Deterministic Steps

1. If the job already exists:
   - load `compute/load-job-context.graphql`
   - inspect status, sub-status, runtime, resource, bindings, and ports
2. If the job has not been created yet:
   - run mode-specific preflight:
     - workspace -> `references/workflows/compute/create-workspace.md`
     - task -> `references/workflows/compute/create-task.md`
   - if mode is still ambiguous, use `references/workflows/compute/create-job.md` as fallback
3. Check permission surfaces:
   - owner visibility
   - project `canCreateJob`
   - project `canOnlyAccessPublicResource`
4. Check limitations per `references/workflows/common/check-limitations.md`:
   - resource parallel limit
   - if the returned failure/error message matches "资源 [X] 超出集群限制", route it
     to the cluster-limit outcome (priority 3 below) — this is not derivable
     from `limitations`, only from the error message itself
5. Check compute selection:
   - resource exists
   - resource passes the create-job resource gates
   - runtime exists
   - runtime is not deprecated
6. Check quota:
   - estimated quota is informational for user display
   - do not treat estimated quota alone as create gate evidence
7. Check bindings:
   - dataset version exists and `isDeleted` is false
   - user has read access on the dataset
   - writable binding requires `canBeBoundWithWritePermission`
   - do **not** check `canBindJob` (model-serving only, see `clone-tutorial.md`)
8. Check ports:
   - every port is a valid integer
   - every port entry matches `PortInput`
9. Return the most likely human explanation first, then mention the evidence.

## Diagnosis Priority

Use this priority order when more than one issue appears:

1. permission denied
2. parallel limit exceeded (资源 X 超出个人限制)
3. cluster limit exceeded (资源 [X] 超出集群限制 — cluster-wide free slots exhausted, not a personal limit; only waiting or switching resource helps)
4. quota insufficiency
5. resource full load
6. runtime unavailable
7. dataset binding problem
8. malformed input such as ports

If the debugging session moves into SSH work (long-running commands, auth failures, password fallback), follow `references/workflows/common/ssh-best-practice.md`.

## Output Style

- lead with the likely cause
- mention the exact field or preflight check that failed
- recommend the smallest next action the user can take

## GraphQL Operations

- `references/graphql-operations/compute/load-job-context.graphql`
- `references/graphql-operations/common/load-party-context.graphql`
- `references/graphql-operations/common/load-resource-catalog.graphql`
- `references/graphql-operations/common/load-runtime-catalog.graphql`
- `references/graphql-operations/common/load-quota.graphql`
