---
tier: confirm
title: 创建 job
effect: 启动新的计算任务或工作空间，并按所选资源开始计费
subject: userId
highlight: [input]
---

# create-job.vars.md

`createJob(userId: String!, input: CreateJobInput)` creates a `Job`.

**Scope:** the `input` field list, mode → sub-input pairing, schema-mirrored
enums, and worked `vars.json`. *Decision* rules live in
`references/workflows/compute/create-job.md` and the mode-specific workflows;
each nested input's semantics are owned by another file (table under "Nested
input shapes"). Where this file and an owning file disagree, the owner wins.

## ⚠️ `runtime` and `resource` are **strings**, not objects

Job queries return these as objects, so mirroring that shape into the variables
is the natural first attempt. `CreateJobInput` does not accept it.

| | Read back as | Send as |
|---|---|---|
| runtime | `Runtime { framework, version, device }` | `String!` — see construction below |
| resource | `Resource { name, memory, cpu, gpu, ... }` | `String!` — the `name` field only |

Do not probe the shape by sending a guess and reading the validation error —
`references/graphql/schema.graphql` ships in the package.

### Constructing the `runtime` string

This is the canonical rule for the whole package — other workflows point here.

```text
runtime = `${runtime.framework}-${runtime.version}`
```

`version` **already encodes** the OS / python / cuda suffix (e.g.
`0.20.1-2404-py312-cu130`, where `2404` is Ubuntu 24.04). `device` is `CPU` /
`GPU` (schema `DeviceType`) and is **NOT** part of the string ID — it filters
the catalog, it does not appear in the identifier. Appending it (`...-gpu`)
produces an ID that does not exist.

**Catalog lookup is only needed** when the constructed ID is deprecated or
absent from the user's cluster. Then load
`common/load-job-runtime-catalog.graphql`, filter by `framework` and `device`
for a compatible non-deprecated runtime, and tell the user about the
substitution.

### The `resource` string

Send `Resource.name` verbatim from the catalog. Naming convention is
`{gpu-type}-{count}` (`a100-1`, `rtx-4090-2`) — the trailing number is the
tier's **GPU count**, not a version.

Enumerate valid values with `common/load-job-runtime-catalog.graphql` and
`common/load-shared-resource-catalog.graphql`. Never assemble either string from
a name the user said out loud — resolve it against the catalog, which also
carries the `affordable` / `isFullLoad` gates you need anyway.

## `CreateJobInput` fields

From `references/graphql/schema.graphql`:

| Field | Type | Notes |
|---|---|---|
| `runtime` | `String!` | Required. See above. |
| `resource` | `String!` | Required. The `Resource.name` value from the catalog. |
| `mode` | `JobMode` | `WORKSPACE` or `TASK` only — see next section. |
| `newWorkspace` | `NewWorkspaceInput` | `mode: WORKSPACE`. Send `{}` when the user did not ask for persistence. |
| `newTask` | `NewTaskInput` | `mode: TASK`. |
| `projectId` | `String` | Two-step: create the Project first, then send `projectId` and omit `projectName` **and** `tagNames` (`create-job.md` → Project Tag Context). |
| `projectName` | `String` | One-step: create the Project and the Job together. |
| `description` | `String` | Optional free text. |
| `dataBindings` | `[DataBindingInput!]` | Dataset / job-output mounts. |
| `parameters` | `[JobParameterInput!]` | Environment variables (plain or Secret). |
| `ports` | `[PortInput!]` (default `[]`) | Custom mappings only. `8080` **and** a list of platform ports (`22`, `80`, `4545`, `5901`, `6006`, `6637`, `7088`, `8200`, `8300`, `8888`) are reserved — full rule in `update-job-ports.vars.md`. |
| `tagNames` | `[TagInput]` (default `[]`) | Tags the **Project**, not the Job — jobs have no tags. ML omits it entirely; HPC sends one `TagInput`. See `references/concepts/resource-tags.md`. |
| `labels` | `[LabelInput!]` (default `[]`) | `{ key, value }`. |
| `useRDMADevices` | `Boolean` (default `false`) | |

### Mode → matching sub-input

**`WORKSPACE` and `TASK` only** — policy and rationale in `SKILL.md` →
"Compute Create Routing". The schema declares all seven modes; presence in
`JobMode` is not permission to send one. `SANDBOX` in particular is internal
Agent infrastructure — never create one on a user's behalf.

Both `new*` fields are optional in the schema (no `!`); sending the one matching
`mode` is a *workflow* rule, and the package does not state it with equal force
for the two:

| `mode` | Sub-input | Sub-input fields | What this package says |
|---|---|---|---|
| `WORKSPACE` | `newWorkspace` | `code: ID`, `persistent: Boolean = false`, `planId: String`, `renewable: Boolean` | **Required** — `create-workspace.md` says "must be present" / "Never omit". `{}` unless persistence was asked for |
| `TASK` | `newTask` | `command: String`, `code: ID` | *Prefer* including (`create-task.md`): `{}`, or `{ command }` if given |

Whether the server rejects a payload with `new*` missing is **not measured** —
the table reports package guidance and schema types, nothing more.

### Nested input shapes

Type signatures only. **Each of these has an authoritative section elsewhere
that carries rules this file does not repeat — go there before filling one in.**

```graphql
input DataBindingInput { name: String!, path: String!, bindingType: DataType, bindingAuth: BindingAuth }
input JobParameterInput { name: String!, value: Json, isSecret: Boolean }
input PortInput { name: String, port: Int! }
input TagInput { name: String, editable: TagBooleanAttributeInput!, hidden: TagBooleanAttributeInput! }
```

| Input | Read this first | Why the signature alone is not enough |
|---|---|---|
| `DataBindingInput` | **two owners** — `create-job.md` → "Data Binding Canonical Rules" for `name` / `path`; `clone-tutorial.md` → "DataBindingInput fields" + "Constrained combinations" for `bindingType` / `bindingAuth` | Canonical `name` forms (`<owner>/<dataset>/<version>`, `<owner>/jobs/<jobId>/output`), write-side paths must be canonical `/output` / `/input{N}` while read-side may come back vendor-prefixed — and only three `bindingType` × `bindingAuth` × `path` combinations are legal (`OUTPUT` + `READ_ONLY` at vendor home and `DATASET` + `READ_WRITE` are never emitted and must never be sent) |
| `JobParameterInput` | "`parameters[].value` is `Json`" below, then `create-job.md` → "Environment Variables (parameters)" | `value` is a `Json` scalar with a server-side shape rule — a numeric value sent as the string `"1"` is **rejected** (see below). `isSecret` changes behaviour, not just visibility: plain values are also written to `openbayes_params.json`, Secret values are env-only and come back redacted |
| `PortInput` | `update-job-ports.vars.md` | The name field is `name` on both input and output (it was `customizedName` until a 2026-08 rename); `8080` and a list of platform ports are reserved; the URL form depends on whether the name is set |
| `TagInput` | `references/concepts/resource-tags.md` | Tags the Project. ML omits `tagNames` entirely; HPC sends exactly one. Defaults are `ALLOW_USER_UPDATE` / `USER_VISIBLE` |

## ⚠️ `parameters[].value` is `Json` — send numbers as numbers

`JobParameterInput.value` is the `Json` scalar, not `String`. The server accepts
a JSON **number** or a JSON **string** (plus `null` / a boolean), and rejects
objects and arrays in every form, Secret or not. The trap is the *string*
side: for a plain (non-Secret) parameter, a string whose text is itself a JSON
number, boolean, object or array is rejected with

```text
不合法的参数格式, 参数的类型只能是数字或者字符串，不能包含其他嵌套类型
```

and nothing is created — no job, and no project either when `projectName` was
used. The message mentions nested types, but the value that triggers it is
usually a plain `"1"`.

| `value` sent | Result |
|---|---|
| `1`, `1.5` (JSON number) | accepted; reads back as a number (`"value": 1`) |
| `"SYS"`, `"/output"`, `"01"`, `"1a"`, `""`, `"null"` | accepted |
| `"1"`, `"1.5"`, `"-1"`, `"1e3"`, `" 1"`, `"true"`, `"{}"`, `"[1]"` | **rejected** (string that parses as a JSON number / boolean / object / array) |
| `"1"`, `"true"` with `isSecret: true` | accepted — Secret strings skip this check |
| `{ "a": 1 }`, `[1]` | **rejected** (nested type, with or without `isSecret`) |

So:

- A numeric env var (`NCCL_SHM_DISABLE=1`, `LR=0.001`, `NUM_WORKERS=8`) goes
  out as a JSON number: `{ "name": "NCCL_SHM_DISABLE", "value": 1 }`. Do not
  quote it. Inside the container `env` shows the usual text
  (`NCCL_SHM_DISABLE=1`, `LR=0.001`; a boolean `true` arrives as `FLAG=true`).
- A plain-text string that the user *needs* to be the literal text `1`, `true`
  or `[1]` cannot be sent as a plain parameter — either send the JSON-typed
  value (a number or boolean, which the program reads back as the same text)
  or mark it `isSecret: true`, which bypasses the check but makes the value
  redacted on read-back.
- Never build a value as a JSON-encoded string (`"\"SYS\""`) — that is one of
  the rejected shapes.

Measured on `createJob` only. `restartWorkspace` / `updateJobParameters`
take the same `JobParameterInput`, but whether they run the same check is
**not measured**.

## Enum listings

Copied from `references/graphql/schema.graphql`. Input and response enums for
the same concept are often *different* types — check which side you are on.
`JobMode` is the exception: `CreateJobInput.mode` and `Job.mode` are one type.

## JobMode enum values (入参 `CreateJobInput.mode` / 响应 `Job.mode`)

Listed in full because `Job.mode` can *return* any of them. Only `WORKSPACE`
and `TASK` may be **sent** — see "Mode → matching sub-input" above.

- `WORKSPACE_SNAPSHOT`
- `WORKSPACE`
- `TASK`
- `VIRTUAL_MACHINE`
- `BATCH_TASK`
- `BATCH_WORKSPACE`
- `SANDBOX`

## DataType enum values (入参 `DataBindingInput.bindingType`)

- `DATASET`
- `OUTPUT`

## BindingAuth enum values (入参 `DataBindingInput.bindingAuth`)

- `READ_ONLY`
- `READ_WRITE`

## TagBooleanAttributeInput enum values (入参 `TagInput.editable` / `TagInput.hidden`)

- `ALLOW_USER_UPDATE`
- `NOT_ALLOW_USER_UPDATE`
- `USER_INVISIBLE`
- `USER_VISIBLE`

## JobStatus enum values (响应 `Job.status`)

- `QUEUED`
- `CREATED`
- `RUNNING`
- `SUCCEEDED`
- `CANCELLED`
- `FAILED`
- `CANCELLING`

Do not confuse this with **`JobStatusInput`**, the type used to *filter* job
queries: same seven values **plus `ALL`**. Sending `ALL` where `JobStatus` is
expected is a validation error.

## JobSubStatus enum values (响应 `Job.subStatus`)

- `EMPTY`
- `TERMINATED`
- `TIMEOUT`
- `QUOTA_EXHAUSTED`
- `FETCHING_DATA`
- `INIT_CONTAINER`
- `EXCEED_STORAGE_LIMITATION`
- `CLONE`
- `PULLING`
- `SYNC`
- `SCHEDULE_FAILED`
- `SUBSCRIPTION_CANCELLED`
- `FREE_CPU_LIMIT_EXCEEDED`
- `K8S_RESOURCE_NOT_FOUND`

## vars.json — minimal workspace in a new project

Everything `create-workspace.md` calls for and nothing more. `newWorkspace: {}`
is present but empty — that is deliberate, not an omission. (This is the
minimum the *workflow* prescribes; the schema alone would accept less, but do
not go below it.)

```json
{
  "userId": "<owner-username>",
  "input": {
    "projectName": "<container-name>",
    "mode": "WORKSPACE",
    "newWorkspace": {},
    "runtime": "<runtime-id-from-catalog>",
    "resource": "<resource-name-from-catalog>"
  }
}
```

## vars.json — workspace in an existing project, with binding, port and env var

```json
{
  "userId": "<owner-username>",
  "input": {
    "projectId": "<projectId>",
    "mode": "WORKSPACE",
    "newWorkspace": {},
    "runtime": "<runtime-id-from-catalog>",
    "resource": "<resource-name-from-catalog>",
    "description": "vLLM serving experiment",
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
      { "name": "HF_TOKEN", "value": "<token>", "isSecret": true },
      { "name": "NCCL_P2P_LEVEL", "value": "SYS" },
      { "name": "NCCL_SHM_DISABLE", "value": 1 }
    ]
  }
}
```

`NCCL_SHM_DISABLE` is a JSON number on purpose — `"1"` (a quoted numeric
string) is rejected by the server; see "`parameters[].value` is `Json`" above.

For `mode: TASK`, swap `newWorkspace: {}` for
`newTask: { "command": "python train.py" }`; the rest is unchanged. There is no
third variant — no other mode is supported.

## Read-back

`createJob` returns `id`, `name`, `mode`, `status`, `subStatus`, `owner`,
`project`, `links`, `ports`.

`links` is selected, but do not expect the access URLs to be there yet: per
`update-job-ports.vars.md`, port URLs "appear only when the job is `RUNNING`
and provisioning is complete; on a non-running or still-provisioning job,
expect them to be absent (not an error)". A freshly created job is by
definition not yet running. Read back with `compute/load-job-context.graphql`
once it reaches `RUNNING`, and never hand-build a URL from the pieces — the
server owns construction.

## See Also

- Decision rules, gates, failure translation: `references/workflows/compute/create-job.md`
- Mode-specific flows: `create-workspace.md`, `create-task.md`
- Restarting a stopped workspace: `restart-workspace.vars.md`

(Nested-input owners are in the table under "Nested input shapes".)
