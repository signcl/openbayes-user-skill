---
tier: confirm
title: 重启 workspace
effect: 重新启动已停止的容器，并按所选资源恢复计费
subject: jobId
highlight: [input]
---

# restart-workspace.vars.md

`restartWorkspace(userId: String!, jobId: String!, input: RestartWorkspaceInput!)`
brings a **stopped** workspace back up. This file is the shape reference for
`input`; the decision rules (which restart mutation, override validation,
Secret handling) live in `references/workflows/compute/restart-job.md`.

**Workspace mode only** (`SKILL.md` → "Compute Create Routing"). The schema
also declares `restartVirtualMachine` / `restartBatchWorkspace`, but no
operation files exist for them — do not hand-write one from the schema.

## ⚠️ `runtime` and `resource` are **strings**, not objects

Same trap as `createJob`: the job context you just read returns them as objects
(`runtime { framework version device }`, `resource { name ... }`) but the input
wants scalar strings. Construction rules, catalog queries, and the "`device` is
not part of the runtime ID" caveat are in **`create-job.vars.md`**.

## `RestartWorkspaceInput` fields

From `references/graphql/schema.graphql`:

```graphql
input RestartWorkspaceInput {
  dataBindings: [DataBindingInput!]
  runtime: String!
  resource: String!
  parameters: [JobParameterInput!]
  useRDMADevices: Boolean = false
  ports: [PortInput!] = []
  planId: String
  renewable: Boolean
}
```

### What is *not* here

Restart reuses the existing job's project and mode, so several `CreateJobInput`
fields have no counterpart. Sending them is a validation error, not a no-op:

- no `mode` / `newWorkspace` — the mode comes from the existing job
- no `projectId` / `projectName` — the project is fixed
- no `description` / `tagNames` / `labels`

`persistent` also does not appear: it is set at creation
(`NewWorkspaceInput.persistent`) and is not re-decidable on restart. `planId`
and `renewable` are the billing knobs restart *does* expose.

Nested shapes (`DataBindingInput`, `JobParameterInput`, `PortInput`) and their
enum values are identical to `create-job.vars.md`.

## Treat the input as a full replacement, not a delta

Always **read `load-job-context.graphql` first**, reconstruct the whole input
from the current job, then layer overrides on top (`restart-job.md` step 9).
`runtime` and `resource` are `String!`, so a pure delta is not expressible
anyway.

> **Not measured.** Whether omitting `dataBindings` / `ports` / `parameters`
> drops them or inherits the previous run has not been verified against a live
> endpoint. Reconstructing in full is correct either way — but do not cite this
> section as evidence for what omission *does*. If you need that answer,
> measure it and record the result here.

## Secret parameters: reference by name, never copy the redaction

Job context returns Secret parameters with the value **redacted** (e.g.
`hf••••23`). Copying that string back in overwrites the real secret with the
mask.

| Intent | What to send |
|---|---|
| Keep the Secret unchanged | `{ "name": "<same-name>", "isSecret": true }` — **no `value`**; the platform backfills server-side |
| Change the Secret | `{ "name": "<same-name>", "value": "<new-value>", "isSecret": true }` |
| Plain-text parameter | carry `{ name, value }` over verbatim |

## Action gate: the job must already be stopped

`restartWorkspace` is not "stop and start" — the job must already be down.
Prefer `Job.canStart` (`Boolean!`, on every job type); the status-by-status
table is in `references/workflows/compute/restart-job.md` → "What Counts as
Stopped".

## vars.json — plain restart, same config as before

Reconstructed from `load-job-context.graphql` with no overrides:

```json
{
  "userId": "<owner-username>",
  "jobId": "<jobId>",
  "input": {
    "runtime": "<runtime-id-from-job-context>",
    "resource": "<resource-name-from-job-context>",
    "dataBindings": [
      {
        "name": "<owner>/<dataset>/<version>",
        "path": "/input0",
        "bindingType": "DATASET",
        "bindingAuth": "READ_ONLY"
      }
    ],
    "ports": [
      { "name": "vllm", "port": 8000 }
    ],
    "parameters": [
      { "name": "HF_TOKEN", "isSecret": true }
    ]
  }
}
```

To restart onto a different resource, change **only** `resource` and keep every
other field carried over in full — then re-validate `affordable` / `isFullLoad`
and the per-user parallel limit for the new resource
(`restart-job.md` Action Gates 4–5). Quota is not a gate (bootstrap.md:
"quota ≠ capability").

## Read-back

The mutation returns `id`, `name`, `mode`, `status`, `subStatus`, `owner`,
`project`, `ports`. Response enum values (`JobMode`, `JobStatus`,
`JobSubStatus`) are listed in `create-job.vars.md`.

Access links are **not** on this response — reload
`compute/load-job-context.graphql` and read `links[]` once the job reaches
`RUNNING`. For workspace jobs, `references/ui-links.md` governs which link to
surface and how to present `Job.password` (Jupyter token + SSH password), which
is re-minted on restart.

## See Also

- Decision rules, gates, failure translation: `references/workflows/compute/restart-job.md`
- Input string construction, nested shapes, enum listings: `create-job.vars.md`
- Port semantics and URL forms: `update-job-ports.vars.md`
- Env-var product behavior: `references/openbayes-docs/gear/env-vars.md`
