# Create Serving

Use this workflow to create a new serving (first release), usually from a source job.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Create a new serving with its first version, from preflight data (`references/workflows/serving/preflight-from-job.md`) or, with no source job, the equivalent direct checks — see Prerequisites.

## Main Entity

- Primary aggregate root: `Serving`
- Created runtime sub-entity: `ServingVersion`
- Source context: `Job`, or the bindings' dataset versions when there is none

## Prerequisites

**From a source job**: run `references/workflows/serving/preflight-from-job.md` first. The preflight must provide:

- validated runtime (aligned to source job)
- validated resource (forced to source job resource)
- readonly serving-compatible bindings
- confirmed startup script with `OPENBAYES_SERVING_PRODUCTION` port switch

**Without a source job** (a known-good `start.sh` in a dataset — see `serving/build-serving-from-scratch.md`): preflight-from-job does not apply, but the same invariants do. Check them against the bindings being assembled: the working-directory binding contains `start.sh` with the port switch, model artifacts readonly under `/input*`, resource passes `check-limitations.md` plus `affordable`/`isFullLoad`. Runtime and resource are the user's choice here, so restate both in the confirmation.

## Required Reads

Before mutation, have these reads in hand:

- party context
- source job context from preflight — **from-job path only**; otherwise read the dataset version providing the working directory (confirm `start.sh` is in it) plus the model binding versions
- candidate resource catalog queried with the shared resource catalog template
- candidate runtime catalog queried with the same runtime list shape used by job creation

Do not build the create payload from memory alone.

## Action Gates

Check these before creating:

- `party.features` contains `SERVING`
- the **working-directory binding** (mounted at `/output` or its vendor-home form) contains `start.sh`, and that script has the `OPENBAYES_SERVING_PRODUCTION` port switch — preflight's output on the from-job path, verify it directly otherwise
- target resource still passes current limitation and availability checks

## Deterministic Steps

1. Ensure the prerequisites above are satisfied (preflight from a job; equivalent checks otherwise).
2. Build serving input:
   - Align runtime to source job unless migration is explicitly requested; with no source job, use the runtime the user picked.
   - Force resource to source job resource; with no source job, use the resource the user picked.
   - Convert bindings to readonly serving-compatible bindings — see [ServingDataBindingInput fields](#servingdatabindinginput-fields) for the exact field mapping when constructing `dataBindings[]` by hand.
3. If preflight marked a mandatory source-workspace stop, stop the source workspace and wait for it to be fully stopped before creating the serving.
4. Restate the serving configuration and ask for confirmation.
5. Execute `serving/serving-create.graphql`.
6. Continue to `references/workflows/serving/read-serving-status.md` for readiness verification.

## ServingDataBindingInput fields

When constructing each entry of `CreateServingInput.dataBindings[]` (and the equivalent on `CreateServingVersionInput.dataBindings[]`), the field names in `ServingDataBindingInput` are **inverted relative to what the schema names suggest**:

| Field | What goes here | Example |
|---|---|---|
| `name` | the **data reference** — `<owner>/<datasetId-or-name>/<version>` for a dataset, or `<owner>/jobs/<jobId>/output` for a job-output | `zhangsan/Qw8ZrT4nKpL/1` |
| `path` | the **container mount path** — `/input0`, `/output`, `/openbayes/input/input0`, etc. (both short and prefixed forms accepted by the server) | `/openbayes/input/input0` |
| `bindingType` | `DATASET` or `JOB_OUTPUT` — always specify, do not rely on inference | `DATASET` |
| `bindingAuth` | `READ_ONLY` (serving's only valid value) | `READ_ONLY` |

Do not read the schema field names literally. `name` is the data ref; `path` is the mount path. The schema's `path` field for *reading* a serving version (`ServingVersion.dataBindings[].path`) carries the data reference, which is the opposite of where it lives in the input shape — this asymmetry is the root of the most common "无效绑定目录" failure.

### Recommend ID over display name in `name`

The server accepts both the dataset's display name and its stable ID in the data reference. Prefer the ID:
- Dataset: `<owner>/<datasetVersion.dataset.id>/<version>` (e.g. `zhangsan/Qw8ZrT4nKpL/1`) — not `<owner>/<datasetVersion.name>/<version>` (display name can contain `/`, `:`, Chinese punctuation, and changes on rename).
- JobOutput: `<owner>/jobs/<job.id>/output` (e.g. `zhangsan/jobs/t6hy9cw3bl27/output`) — not `<owner>/jobs/<job.name>/output`. See also `references/workflows/compute/clone-tutorial.md` → "Use canonical names for the payload".

### Constrained combinations (serving)

Servings are read-only consumers of data. Only one auth applies:

| `bindingType` | `bindingAuth` | `path` shape | Meaning |
|---|---|---|---|
| `DATASET` | `READ_ONLY` | `/input*` (or `/openbayes/input/input*`) | Dataset dependency |
| `JOB_OUTPUT` | `READ_ONLY` | `/input*` | Third-party job output used as dependency |
| `JOB_OUTPUT` | `READ_ONLY` | `/output` (or vendor home) | Source job's own `/output` mounted as the serving's working dir |
| `DATASET` | `READ_ONLY` | `/output` (or vendor home) | A dataset carrying `start.sh` used as the working dir — the no-source-job path |

The requirement is **content, not provenance**: one binding must land on the working directory carrying `start.sh`. A job output is usual only because that is where a tested workspace's script already sits; a dataset holding a known-good script is equally valid.

Differences vs compute jobs (where `DataBindingInput` allows `READ_WRITE` for self-output): serving versions never have `READ_WRITE` bindings.

### Worked example

Deploy from source job `t6hy9cw3bl27` (vLLM workspace) which has its own `/output` plus a model dataset `Qw8ZrT4nKpL` version `1`:

```jsonc
"dataBindings": [
  { "name": "zhangsan/Qw8ZrT4nKpL/1",
    "path": "/openbayes/input/input0",
    "bindingType": "DATASET",
    "bindingAuth": "READ_ONLY" },
  { "name": "zhangsan/jobs/t6hy9cw3bl27/output",
    "path": "/openbayes/home",
    "bindingType": "JOB_OUTPUT",
    "bindingAuth": "READ_ONLY" }
]
```

This matches what `console/src/utils/forms.tsx#handleServingRerunDatasets` produces when converting a source job's bindings into serving bindings.

### Mapping from a previous `ServingVersion` snapshot

If you are not running preflight from a job and instead want to reproduce a previous version's bindings verbatim (rare — usually only when migrating across servings), the field rename is:

| Field on read (`ServingVersion.dataBindings[i]`) | Field on input (`ServingDataBindingInput`) | Notes |
|---|---|---|
| `path` (holds the data reference) | `name` | Source of confusion — read-side `path` is not the mount path |
| `mountPath` | `path` | The actual mount path lives here on read |
| `type` | `bindingType` | Same enum |
| `bindingAuth` | `bindingAuth` | Same |
| `name` (display name like "Qwen3.6-35B-A3B") | (discard) | Not used in the input shape |

If the use case is restart, **do not** rebuild bindings — `ServingVersion` is immutable; use `references/workflows/serving/restart-serving.md` (which calls `updateServingVersion`, no bindings re-supplied).

## Guardrails

- When there is a source job, never create serving without running preflight first — and never use a resource different from that job's.
- Never create a serving whose working-directory binding (`/output` or vendor home) lacks `start.sh`, or whose script lacks the port switch. This is the real invariant; "preflight ran" is how you establish it from a job, not a substitute for it.
- Never skip confirmation.
- Never violate the handoff decision produced by preflight for source-workspace stop versus direct rollout.

## Read-Back

After mutation, continue to `references/workflows/serving/read-serving-status.md` and report:

- serving id and top-level status
- first serving-version status
- exposed endpoint links
- whether control-plane and data-plane readiness both pass

## GraphQL Operations

- `references/graphql-operations/serving/serving-create.graphql`
- `references/graphql-operations/common/load-shared-resource-catalog.graphql`
- `references/graphql-operations/common/load-job-runtime-catalog.graphql`

## Failure Translation

- permission denied -> the current user cannot create a serving
- resource unavailable -> the source job resource is full or unaffordable
- parallel limit exceeded -> user has reached their concurrent container limit for this resource
