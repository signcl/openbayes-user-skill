# Clone Tutorial

Use this workflow when the user wants to clone (克隆) a public tutorial into their own account.

## Goal

Reproduce a public tutorial's job configuration under the current user's account so the user can run it independently.

## How Cloning Works

Cloning a tutorial is a two-phase flow:

1. **Read phase** — load the source tutorial's job configuration from the public project.
2. **Create phase** — create a new job under the current user using the source job's settings as defaults.

This mirrors the console's `rerunUsername` + `rerunJobId` redirect to the container creation page.

### Lookalikes that are not clone

- `CreateJobInput.clonedFromPublicProjectId` records lineage only — no home content, no bindings inherited; a clone built on it has no tutorial files and no model mounted.
- `newWorkspace.code` is a `SourceCode` id; a job or snapshot id fails with 「该源代码不存在」.
- `restartWorkspace` rejects snapshots (「virtual machine 或者 workspace 类型的 job 才可以重启」) — the snapshot path is [2a](#2a-latest-version-is-a-snapshot), not a restart.

## Prerequisite

- Bootstrap context must be available (see `references/workflows/common/bootstrap.md`).
- The source tutorial must be identified. If the user has not specified one, run `explore-public-resources` first to help them find it.

## Deterministic Steps

### 1. Identify the Source Tutorial

If the user provides a tutorial name or keyword:

1. Search public projects via `compute/project-search-public.graphql` with the keyword and `tagNames: ["public"]` (matches the public tutorial page in the product UI; see `common/explore-public-resources.md`).
2. Present matching tutorials with name, description, owner, and job count.
3. Ask the user to confirm which tutorial to clone.

If the user already provides a specific job ID or project ID, skip the search.

### 2. Load Source Job Configuration — the latest version is the source of truth

Resolve the tutorial's **latest** job from the public project, then load it via `compute/load-job-context.graphql`:

```
variables: { userId: <source-owner-username>, jobId: <source-job-id> }
```

Clone the latest version as is. Do not hunt older sibling versions for one that "looks more cloneable": if the newest cannot be reproduced, that is a tutorial-side defect — report and stop. An older pick silently ships a different model, runtime, and binding set than the tutorial page advertises.

Both public-facing queries report snapshots accurately (`publicProjects.latestJob.mode` and the project query's `latestJob.mode` → `WORKSPACE_SNAPSHOT`, verified on every snapshot-latest public tutorial; the job query's `__typename: WorkspaceSnapshot` agrees). A snapshot is a normal, expected latest version — not a reason to look elsewhere.

#### 2a. Latest version is a snapshot

A snapshot records the parent workspace's runtime, resource, and data bindings. Reproduce it by creating a **`mode: WORKSPACE`** job with:

- `runtime` and `resource` from the snapshot record.
- Every recorded binding, verbatim, per [DataBindingInput fields](#databindinginput-fields). Snapshot records hold `DatasetBinding`s only — no home mount, no `JobOutputBinding` (every record checked) — so the working directory must come from the extra binding below.
- One extra binding, always:
  `{ name: "<owner>/jobs/<snapshot-id>/output", path: "/openbayes/home", bindingType: "OUTPUT", bindingAuth: "READ_WRITE" }`.
- `newWorkspace`: snapshots expose no `isPersistent` (`Workspace`-only field) — nothing to mirror. Use the `create-workspace.md` default (`{}` unless the user asks for persistence) plus `renewable: true` (step 4 convention).

That binding is the console's 「继续执行」: it mounts the previous execution's output at the new workspace's `/openbayes/home` (`references/openbayes-docs/gear/faq.md`), carrying the tutorial's notebooks, launcher scripts, and `.pylibs` into the clone — without it, home starts empty.

**Sanity check.** After `RUNNING`, list `home` via the Jupyter contents API: it must contain the tutorial's own files — an empty home (or only `.pylibs`) means the home binding is wrong. If a README or notebook names an interpreter path like `.pylibs/lib/python3.10/site-packages` and the runtime image ships a different Python, you reproduced the wrong version: redo this step rather than installing a second environment inside the container.

Extract the following fields for the clone payload:

| Source Field | Target CreateJobInput Field | Notes |
|---|---|---|
| `mode` | `mode` | Preserve original mode (usually `WORKSPACE`) |
| `runtime` | `runtime` | Concatenate source `runtime.framework` + `-` + `runtime.version`. The version string already encodes the python/cuda suffix (e.g. `0.20.1-2404-py312-cu130`); `device` is `CPU`/`GPU` and is NOT part of the string ID. Format and catalog-fallback rules: see [Field Mapping: Runtime String](#field-mapping-runtime-string). |
| `resource.name` | `resource` | Must be available in current user's catalog |
| `dataBindings[]` | `dataBindings[]` | **Copy verbatim**, one `DataBindingInput` per source binding, preserving all four fields. The source has already encoded the correct semantics — do not transform. See [DataBindingInput fields](#databindinginput-fields). |
| `ports` | `ports` | Copy port mappings |
| `parameters` | `parameters` | Copy job parameters |
| `description` | `description` | Optional; can note "Cloned from ..." |
| `useRDMADevices` | `useRDMADevices` | Preserve if set |
| `project.tags[].name` | `tagNames[].name` | Apply canonical Tag Propagation. |
| `isPersistent` (Workspace only) | `newWorkspace.persistent` | **Mirror the source's value verbatim** — `true` → `true`, `false` → `false`. Do not default per create-workspace.md and do not infer from binding shape. |

### 3. Validate Against Current User Context

Before creating, validate that the current user can actually run this configuration:

1. **Runtime availability** — load `common/load-job-runtime-catalog.graphql` (with RDMA label if `useRDMADevices` is true) and verify the source runtime exists and is not deprecated. If unavailable, suggest the closest alternative.
2. **Resource availability** — load `common/load-shared-resource-catalog.graphql` and check that the source resource passes both gates (cluster capacity, per-user parallel limit). If unavailable, suggest alternatives.
3. **Data binding validity** — default is **verbatim copy** of every source binding (see [DataBindingInput fields](#databindinginput-fields) for the field-level rules). The source has already chosen `bindingType`, `bindingAuth`, and `path` correctly; the clone reproduces them faithfully. Apply only the following **exclusions**:
   - Drop `DatasetBinding` with `isDeleted: true`.
   - Drop `DatasetBinding` with `isPublic: false` AND the current user has no read access (e.g., not a member of the owning org).
   - Drop `JobOutputBinding` whose referenced source job is deleted or non-public AND the current user has no access.
   - Do **not** gate on `datasetVersion.canBindJob`. That field controls a different mutation (`updateDatasetVersionBindingJob`) — who can (re)assign which job is currently *serving* this version as a service. It's designed for model versions (`Dataset.Category = MODEL`) and is normally `false` for anyone who isn't the dataset/model owner, including legitimate clones of public tutorials.
4. **Limitations check** — run `references/workflows/common/check-limitations.md`.
5. **Project Tag Context** — apply `references/concepts/resource-tags.md`: source ML: omit `tagNames`; source HPC: send one inherited HPC `[TagInput]` regardless of destination-vendor assumptions. On failure, never fall back to ML.

### 4. Build the Create Payload

Construct `CreateJobInput` with the mapped fields:

- Set `projectName` to a reasonable default (e.g., the source project's name) or let the user choose.
- Copy each source binding's `mountPath` into `path` verbatim — do **not** normalize or remap. See [DataBindingInput fields](#databindinginput-fields).
- Set Project Tag Context per step 5.
- For `Workspace` clones, set `newWorkspace.persistent` from the source's `isPersistent` (see Field Mapping table) and `newWorkspace.renewable: true` matching the console clone convention (the value is a fresh billing intent for the clone, not a source field).

### 5. Confirm and Execute

Follow the mode-specific create confirmation flow:

1. Restate the full configuration (owner, mode, runtime, resource, bindings, ports, localized Project channel).
2. Highlight any differences from the source tutorial (e.g., resource substitution, removed bindings).
3. Note that this is a clone from a public tutorial: `"Cloned from <owner>/<project-name>"`.
4. Wait for user confirmation.
5. Route before mutation:
   - `mode=WORKSPACE` -> follow `references/workflows/compute/create-workspace.md`
   - `mode=TASK` -> follow `references/workflows/compute/create-task.md`
   - latest version is `WORKSPACE_SNAPSHOT` -> create as `mode: WORKSPACE` per [2a](#2a-latest-version-is-a-snapshot)
   - any other mode (`VIRTUAL_MACHINE`, `BATCH_*`) -> not supported; stop and tell the user instead of cloning
6. Execute `compute/create-job.graphql`.
7. Read back the created job via `compute/load-job-context.graphql` and verify the destination Project channel matches the source channel.
8. Summarize: id, mode, status, project, links, bindings.
   Before telling the user where the tutorial is, poll `load-job-context`
   (a GPU clone went `CREATED`/`FETCHING_DATA` → `RUNNING` in about 30 s).
   Stop and report the status on `FAILED` / `CANCELLED` / `SUCCEEDED`; if it
   is still `QUEUED` / `CREATED` after about 5 minutes, tell the user and stop
   polling. Once `RUNNING`, check the clone's own files: list the vendor home
   with the Jupyter contents API (`GET <links.workspace>/api/contents/home`,
   header `Authorization: token <Job.password>`, never echo the password) or
   over SSH. Build the notebook deep link from a file actually listed there,
   per `references/ui-links.md`. Do **not** use `job-jupyter` / `job-readme`
   on the clone: on a `RUNNING` workspace both returned `null` for 4 minutes
   while `home/` already held `README.ipynb`, and `job-jupyter` filled in
   about 20 s after the job stopped. A `null` there never means the clone is
   empty. The source tutorial's job is only for describing the tutorial, not
   for proving what the clone contains.
9. **Point at the demo URL.** Tutorial demos usually appear on `links.auxiliary`
   after the user starts the launcher in `/output` (`app.py`, `*_launch*.py`, or
   notebook cell binding `0.0.0.0:8080`). Cloning does not auto-start it. Route
   "open / start the demo" follow-ups through `references/workflows/compute/access-job-service.md`.

## Field Mapping: Runtime String

The source job returns `runtime` as `{ framework, version, device }`; the
`CreateJobInput.runtime` field expects a string. Build it from the **source**
job's values using the canonical rule in
`references/graphql-operations/compute/create-job.vars.md` →
"Constructing the `runtime` string", which also covers the catalog fallback for
a deprecated or missing ID.

For a normal clone — source runtime current and available — no catalog call is
needed.

## Field Mapping: Binding Names

When mapping `dataBindings[]` from the source job into `CreateJobInput.dataBindings`, two fields look similar but are not interchangeable:

- **`DataBinding.semanticBindingName`** — the *as-stored* name on the binding record. For older tutorials this can carry a stale alias namespace (e.g., a former owner's username before a dataset transfer), and for `JobOutputBinding` it interpolates the source job's *display name* which can contain `/`, `：`, or Chinese punctuation. Do **not** copy this value verbatim into the create payload.
- **Use canonical names for the payload**:
  - `DatasetBinding` → take `datasetVersion.semanticBindingName` (e.g., `hyperai-tutorials/Qwen3-Omni-30B-A3B-Captioner/1`). This is always the current owner / version triple.
  - `JobOutputBinding` → construct as `<job.owner.username>/jobs/<job.id>/output`. Use the job **ID**, not the display name surfaced via `semanticBindingName`.

If a `DatasetBinding.semanticBindingName` does not match its `datasetVersion.semanticBindingName`, that's a remap signal — trust the dataset-version side.

## DataBindingInput fields

Every entry in `CreateJobInput.dataBindings[]` is a `DataBindingInput` with four fields. The source already provides three of them directly; the fourth (`bindingAuth` for `JobOutputBinding`) is inferred from `mountPath` because the schema does not expose `bindingAuth` on `JobOutputBinding`.

| Field | Source for clone | Notes |
|---|---|---|
| `name` | derived per [Field Mapping: Binding Names](#field-mapping-binding-names) | Canonical owner/name/version (Dataset) or `<owner>/jobs/<jobId>/output` (JobOutput) |
| `path` | source `binding.mountPath` | **Verbatim — do not remap.** The choice of `/input*` vs vendor home carries semantic meaning |
| `bindingType` | `DatasetBinding` → `DATASET`; `JobOutputBinding` → `OUTPUT` | **Required — do not omit.** Mechanical from source `__typename` |
| `bindingAuth` | `DatasetBinding`: source `bindingAuth` verbatim. `JobOutputBinding`: infer from `mountPath` — see constrained combinations below | Schema does not expose `bindingAuth` on `JobOutputBinding`; the inference is unambiguous because the platform only emits a fixed set of combinations |

### Constrained combinations

Only three combinations exist in practice. For `OUTPUT` bindings, use this table to assign `bindingAuth`:

| `bindingType` | `bindingAuth` | `path` shape | Meaning |
|---|---|---|---|
| `DATASET` | `READ_ONLY` | `/input*` (e.g. `/openbayes/input/input0`) | Dataset dependency |
| `OUTPUT` | `READ_ONLY` | `/input*` | Job output as dependency (behaves like a dataset binding) |
| `OUTPUT` | `READ_WRITE` | vendor home (`/openbayes/home`, `/hyperai/home`, ...) | Workspace storage — typical self-reference for tutorial clones |

Combinations the platform **does not emit** and the clone should never produce:

- `OUTPUT` + `READ_ONLY` at vendor home (RO workspace is meaningless).
- `OUTPUT` + `READ_WRITE` at `/input*` (input slots are RO semantics).
- `DATASET` + `READ_WRITE` (dataset versions are immutable from the job side).

### Why no per-binding decision logic

The source already separates self-ref OUTPUT (RW at vendor home) from third-party
OUTPUT (RO at `/input*`). Copy `path`, infer `bindingAuth` from `path`, and do not
default vendor-home OUTPUT to `READ_ONLY` — that makes the workspace unusable.

### Worked example

Source job `hyperai-tutorials/jobs/10dxn8dabut8` (workspace, `isPersistent: false`) →

```jsonc
"dataBindings": [
  { "name": "hyperai-tutorials/DeepSeek-V4-Flash/2",
    "path": "/openbayes/input/input0",
    "bindingType": "DATASET",
    "bindingAuth": "READ_ONLY" },
  { "name": "hyperai-tutorials/Open-WebUI/5",
    "path": "/openbayes/input/input2",
    "bindingType": "DATASET",
    "bindingAuth": "READ_ONLY" },
  { "name": "hyperai-tutorials/jobs/10dxn8dabut8/output",
    "path": "/openbayes/home",
    "bindingType": "OUTPUT",
    "bindingAuth": "READ_WRITE" }
],
"newWorkspace": { "persistent": false, "renewable": true }
```

Every field is taken from the source — either directly (`DatasetBinding.bindingAuth`, source `isPersistent`) or by trivial inference (`__typename` → `bindingType`; `JobOutputBinding.mountPath` → `bindingAuth`). No per-binding decision logic.

## Clone-as-verbatim Principle

Copy source semantics unless documented otherwise. Resource Tags use canonical Tag Propagation, not verbatim copying.

## Storage

When confirming the clone, summarize which bindings are storage-free (read-only public) and which will consume quota. For full rules see `references/workflows/common/storage-semantics.md`.

## Guardrails

- Never auto-clone without confirmation — always show the full configuration first.
- Never silently drop bindings — if a binding cannot be carried over, tell the user.
- Never use admin scope for clone operations.
- If the source tutorial uses a deprecated runtime or unavailable resource, do not proceed without user acknowledgement of the substitution.

## GraphQL Operations

- `references/graphql-operations/compute/project-search-public.graphql`
- `references/graphql-operations/compute/load-job-context.graphql`
- `references/graphql-operations/compute/create-job.graphql`
- `references/graphql-operations/compute/create-project.graphql`
- `references/graphql-operations/common/load-job-runtime-catalog.graphql`
- `references/graphql-operations/common/load-shared-resource-catalog.graphql`
- `references/graphql-operations/common/load-party-context.graphql`

## Handling Examples

- Specific tutorial request: search public tutorials by keyword, show matches with owner/name/job count, then ask which one to clone.
- Unavailable resource: show the source resource, explain the failed catalog gate (`isFullLoad` / `affordable` / limit), suggest available close alternatives, and wait for confirmation.
- Self-referencing OUTPUT at vendor home: keep it as `OUTPUT + READ_WRITE`; this is the normal tutorial workspace pattern, not a warning condition.
- Inaccessible private/deleted binding: drop it, name the skipped binding, warn that the clone may not run end-to-end, and ask before proceeding.
