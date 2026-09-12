# Create Job

Compatibility entry for job creation. Prefer the mode-specific workflows:

- `create-workspace.md`
- `create-task.md`

Use this workflow only when the user request is ambiguous and a mode-specific workflow cannot be selected yet.

## Goal

Turn a natural-language request into a validated `createJob` mutation without using admin scope.

## Payload Shape

This file governs *decisions* — which mode, which resource, which gates must pass.
The **`CreateJobInput` shape** — field table, mode → sub-input pairing, runtime
and resource string construction, enum listings, worked `vars.json` — lives in
`references/graphql-operations/compute/create-job.vars.md`. Read it before
assembling a payload, and never discover the shape by sending a guess and
reading the validation error.

## Routing Rule

Route to one of the mode-specific workflows as early as possible:

- workspace intent -> `references/workflows/compute/create-workspace.md`
- task intent -> `references/workflows/compute/create-task.md`

Keep this file as shared validation and fallback guidance only.

## Main Entity

- Primary aggregate root: `Project`
- Created executable entity: `Job`
- Binding context when bindings are present: `DatasetVersion`

## Input Contract

Required:

- owner reference
- intended job mode
- runtime
- resource

Optional:

- project id or project name
- description
- tag names
- data bindings
- ports
- parameters (environment variables; supports plain-text and Secret — see Environment Variables section)
- billing or plan choice
- access method
- display name
- idle timeout
- workspace persistence request

## Project Shortcut Contract

For write flows, interpret project targeting deterministically:

- `projectId` means create the job inside an existing project.
- `projectName` without `projectId` means `create project + create job` shortcut.
- Do not silently resolve, fuzzy-match, or reuse an existing project by name during job creation.
- If the user means an existing project but only gives a human name, resolve and confirm it first, then write with `projectId`.

## Prerequisite

Requires bootstrap context (see `references/workflows/common/bootstrap.md`). Use user profiling result to select the guidance path below.

## Pre-Create Triage

Before collecting slots,先加载资源和镜像 catalog，再结合 bootstrap 画像决定引导路径：

1. Load `common/load-shared-resource-catalog.graphql` — 获取可用资源列表（含 `affordable`、`isFullLoad`）
2. Load `common/load-job-runtime-catalog.graphql` — 获取可用镜像列表

然后根据用户画像选择路径：

- **老鸟 + 有已停止的 workspace**：先问「重启已有的，还是创建新的？」。若重启，转到 `restart-job.md`。
- **老鸟 + 无已有 workspace**：直接收集缺失参数，不解释概念。若有多个项目，问放哪个项目下。
- **新手**：基于已加载的 catalog，推荐性价比合理的资源和最新主流镜像；简要说明 workspace 是什么（交互式开发环境，Jupyter/SSH）；创建后提示如何访问和关闭。

## Mode Normalization

常规模式（主动推荐）：

- "创建容器" / "开个容器" / "帮我开台机器" -> `mode=WORKSPACE`（参见 `references/i18n/zh-glossary.md`）
- "create a workspace" / "创建工作空间" -> `mode=WORKSPACE`
- "create a task" / "跑个任务" / "训练任务" -> `mode=TASK`

只支持 `WORKSPACE` 和 `TASK`——完整声明见 `SKILL.md` 的 "Compute Create Routing"。用户要虚拟机或批量模式时如实说明不支持，不要改拼 payload；要建 sandbox 时同样拒绝——那是 Agent 内部基础设施，不开放给用户创建。

## Product-Semantic Slot Gathering

For `job.create(mode=WORKSPACE)`, follow the product-side checklist:

- `resource` <- selected compute ("选择所需算力")
- `billingPlan` <- billing or plan choice ("选择计费方式")
- `runtime` <- selected image ("选择镜像")
- `accessMethod` <- intended workspace access pattern ("选择接入方式")
- `displayName` <- user-facing container or job naming intent ("输入容器名称")
- `dataBindings` <- dataset or output bindings ("选择要绑定的数据仓库或执行")
- `idleTimeoutSeconds` <- idle shutdown setting ("设置容器空闲关闭时间")
- `ports` <- port mappings ("配置端口映射"). Default: `0.0.0.0:8080` -> `links.auxiliary` (no mapping); map non-8080 only.

点名资源型号时，未指定槽位可以取默认（自动命名、无 ports、默认空闲、按量·扣余额），但 `create-job` 属于确认档：仍要复述最终计划与计费后果并取得肯定答复。未点名资源时先自然语言收集以上槽位，不能替用户猜完后直接创建。

## Project Tag Context

Jobs have no tags. Apply `references/concepts/resource-tags.md` to new Projects: ML omits `tagNames`; HPC sends one `[TagInput]`. Existing Projects stay unchanged.

- Two-step: create the Project, then create the Job with `projectId`, omitting `projectName` and `tagNames`.
- One-step: call `createJob` with `projectName` and the same ML/HPC rule; verify its Project channel in step 20.

## Required Reads

Load only what is needed to decide whether this project can create this job:

- party context
- project context when creating inside an existing project
- resource and runtime catalogs
- quota view for explanation only
- dataset version context when bindings are requested

Prefer canonical query templates over ad hoc GraphQL when resolving candidate resources and runtimes:

- shared resource selection for compute and serving -> `common/load-shared-resource-catalog.graphql`
- job-create runtime selection -> `common/load-job-runtime-catalog.graphql`
- fallback generic catalog query -> `common/load-resource-catalog.graphql` or `common/load-runtime-catalog.graphql`

## Feature Gates

Treat mode-specific or experimental capabilities as explicit feature-gated flows.

- workspace persistence
  - persistence is experimental and should be treated as disabled by default
  - only request persistent workspace storage when the user explicitly asks for it
  - require the corresponding persistence feature to be enabled in `party.features` before setting a persistent workspace field in the create payload
  - if the feature is absent, refuse the persistent workspace request instead of silently downgrading it

Do not invent feature names. Use the current environment's `party.features` values and product-validated behavior.

## Data Binding Canonical Rules

When `dataBindings` are present, treat the payload shape as:

- `name` = binding source identifier
- `path` = mount path inside the container

Use these canonical forms:

- dataset version: `<owner>/<dataset-id>/<version>`
- job output: `<owner>/jobs/<job-id>/output`

Use these canonical mount paths:

- `/output`
- `/input0` ~ `/input4`

Rules:

- Prefer ids over names for dataset and job references.
- Do not place the source identifier into `path`.
- Use `/output` and `/input*` as the default canonical paths in requests and explanations.
- Treat vendor-prefixed paths (for example `/<prefix>/home` or `/<prefix>/input/input*`) as compatibility aliases only.
- **Write side** (mutation `DataBindingInput.path`): always submit canonical `/output` or `/input{N}`. Do not submit vendor-prefixed forms (`/openbayes/home`, `/openbayes/input/input0`) even though the API accepts them — they make payloads harder to read and audit.
- **Read side** (GraphQL response): returned `dataBindings[].path` may come back vendor-prefixed. Normalize to canonical `/output` / `/input*` before validation and before user-facing summaries.
- Use `/input*` for large readonly inputs such as datasets or models. To cache a workspace artifact into a dataset version, RW-bind the version to `/input{N}` (not `/output`); see `references/workflows/dataset/populate-version.md`.
- Use `/output` only for the current job's own working directory or when the user explicitly wants copy-heavy writable output semantics.
- **Pitfall — never bind external datasets to `/output`.** `/openbayes/home` and `/hyperai/home` are symlinks to `/output`. Binding any dataset version (especially an empty one with RW) to `/output` replaces the workspace working directory contents — workspace files appear to vanish. To cache `/output` contents into a new dataset version, use `/input{N}` — see `references/workflows/dataset/populate-version.md`.
- **Binding another job's output to `/output` is legitimate and must be `READ_WRITE`.** Seeding a new workspace from an existing job's working directory (the "continue from" / "fork from" pattern the console's tutorial-clone uses — see `clone-tutorial.md`'s constrained-combinations table) is a normal `JobOutputBinding` at `/output`. It is not limited to "this job's own" output. This binding must always be `bindingAuth: READ_WRITE` — the `bindingAuth` default-to-`READ_ONLY` rule below does **not** apply to it. `OUTPUT + READ_ONLY` at `/output` is not a combination the platform meaningfully supports; do not propose it even as a cautious default.

## Data Binding Storage

For storage impact of different binding modes (read-only, read-write, `/output` vs `/input*`) and quota considerations, see `references/workflows/common/storage-semantics.md`.

## Environment Variables (parameters)

`parameters` is the environment-variable mechanism for a job — not a separate field. Each entry is `{ name, value, isSecret }` and is injected as an environment variable into the container. Use it to pass third-party tokens, model-repo addresses, hyperparameters, etc.

- **Plain text** (`isSecret` unset or `false`): stored and shown in plain text, injected as an env var, and also written to `openbayes_params.json` so the program can read it. Use for hyperparameters and non-sensitive config.
- **Secret** (`isSecret: true`): env-only. The value is injected as an env var but is **not** written to `openbayes_params.json` and **not** appended to the task command. After save the platform never returns it in plain text — reads come back redacted (for example `hf••••23`). Use for keys, tokens, and other secrets.

Rules:

- `value` is the `Json` scalar: send numbers as JSON numbers (`{ "name": "NCCL_SHM_DISABLE", "value": 1 }`), never as `"1"` — a plain-text string that reads as a JSON number / boolean / object / array is rejected and nothing is created. Which shapes pass, which fail, and the exact server error: `create-job.vars.md` → "`parameters[].value` is `Json`".
- `OPENBAYES_` is a reserved prefix; never use it for a custom variable name (the API rejects it).
- Put secrets only in `isSecret: true` parameters. Never place tokens/keys into plain-text parameters or the task `command`.
- On read, `load-job-context.graphql` returns `parameters { name value isSecret }`. Treat any `isSecret: true` value as redacted: never surface it to the user as a real value, and never echo it back into a later mutation as the real value.
- Restart and clone handle Secrets differently (backfill vs forced re-entry) — see `restart-job.md` and `references/openbayes-docs/gear/env-vars.md`.

See `references/openbayes-docs/gear/env-vars.md` for the full product behavior (masking, type switching, clone re-entry).

## Action Gates

Check these before creating:

1. `project.canCreateJob` when a project is involved
2. for every requested dataset binding: `datasetVersion.isDeleted` is false and user has read access; writable bindings additionally require `canBeBoundWithWritePermission`. Do **not** gate on `canBindJob` (model-serving only, see `clone-tutorial.md`).
3. `party.limitations` checks from `references/workflows/common/check-limitations.md`
4. resource availability gates from catalog (`affordable`, `isFullLoad`)
5. runtime existence and deprecation checks

## Deterministic Steps

1. Normalize the request into `job.create`.
2. Infer `mode` from user language.
3. Resolve owner context with `common/load-party-context.graphql` (or `load-user-context.graphql` / `load-org-context.graphql` when entry point is known).
4. Run limitations check per `references/workflows/common/check-limitations.md`:
   - Resource parallel limit for the selected resource.
   - Project count limit if a new project is needed.
5. If `projectId` is provided, load `compute/load-project-context.graphql`.
6. If `projectName` is provided without `projectId`, reserve it as a new-project shortcut and do not perform existing-project lookup by name.
7. Load `common/load-shared-resource-catalog.graphql` as the shared resource catalog for workspace, task, and serving-related flows unless a narrower validated template is explicitly required.
8. Load `common/load-job-runtime-catalog.graphql` as the runtime catalog.
9. Load `common/load-quota.graphql` (informational display only).
10. If dataset bindings are requested, load:
    - `dataset/load-dataset-list.graphql`
    - `dataset/load-dataset-context.graphql`
11. If job-output bindings are requested, normalize them to `<owner>/jobs/<job-id>/output` before mutation.
12. Normalize any vendor-prefixed binding `path` values into canonical `/output` or `/input*` before validation.
13. Validate:
    - if `projectId` is used, project can create job
    - if `projectName` shortcut is used, project name is valid and project-count limits allow creating a new project
    - selected runtime exists and is not deprecated
    - selected resource passes the Resource and Billing Gates section below
    - every requested dataset version is not deleted and readable (writable needs `canBeBoundWithWritePermission`); do not gate on `canBindJob`
    - every binding uses canonical `name` + `path` semantics
    - ports match `PortInput`
    - payload satisfies `Project Tag Context`
14. Validate mode-specific feature gates:
    - persistent workspace requests must be explicitly requested by the user and pass the corresponding persistence feature gate
15. For workspace mode, resolve the product checklist (resource, billing, runtime, access method, display name, bindings, idle timeout, ports). 用户点名资源时未指定项可取默认；资源未点名时先收集选择，不要静默代选。
16. If workspace persistence is requested, confirm that persistence is experimental, explicitly requested by the user, and enabled in `party.features`.
17. Restate the final write action and wait for an affirmative answer before executing, whether the resource was user-named or selected after discussion（分档规则见 `references/graphql-discipline.md`）. If `projectName` shortcut is used, explicitly restate that both a project and a job will be created.
18. For two-step creation, create and verify the Project per `create-project.md`; retain its ID.
19. Execute `compute/create-job.graphql`:
    - Two-step: set `projectId`; omit `projectName` and `tagNames`.
    - One-step: set `projectName`; apply Project Tag Context; verify via step 20.
    - After a two-step Job failure, retain that Project ID and retry only `create-job.graphql` with `projectId`; never create another Project or resend `projectName`/`tagNames`.
    - If it still cannot complete, report the orphan: no Project-deletion workflow is documented, so do not invent one.
20. Load `compute/load-job-context.graphql` for the created job id. For a one-step `createJob(projectName)` creation, read back the created Project channel and verify it matches the expected channel (default ML when `tagNames` was omitted; HPC when affirmed). On mismatch, report without tag repair, recreation, or fallback.
21. Normalize GraphQL-returned binding paths to canonical forms before presenting them to the user.
22. Summarize the created job: id, mode, status, project, ports, links (`links.ssh`, `links.workspace` / `links.workspace-with-password`, `links.frontend`, `links.auxiliary` when present). For workspace-mode jobs, follow `references/ui-links.md` for which link to surface and how to handle `Job.password` (Jupyter token + SSH password).
23. If the user plans remote shell operations through `links.ssh`, follow `references/workflows/common/ssh-best-practice.md`.

## Resource and Billing Gates

Before `createJob`, the selected resource must pass two independent gates:

- **Gate 1 — Cluster capacity**: `affordable: true` and `isFullLoad: false` from resource catalog.
- **Gate 2 — Per-user parallel limit**: `limitations.resources[resource].freeCount > 0` from party context.

Treat `estimatedQuota` as informational display only; do not use it as the hard gate.

If the user asks to choose billing tier, load plan data from `common/load-unit-computation-plans.graphql` and `common/load-resource-plans.graphql`.

## Validation Rules

- `projectId` and `projectName` should not both be set.
- `projectName` is a new-project shortcut for write flows, not an existing-project lookup key.
- Selected runtime must be present in the candidate runtime list.
- Selected resource must be present in the candidate resource list.
- Selected resource must pass the resource gates above before attempting `createJob`.
- Every dataset binding must reference a bindable version.
- Every job-output binding should use `<owner>/jobs/<job-id>/output` unless a stronger validated reference already exists from product context.
- `bindingAuth` should default to `READ_ONLY` unless the user explicitly asks for writable binding and the dataset version allows it. **Exception:** a `JobOutputBinding` mounted at `/output` (seeding a new workspace from an existing job's output) must be `READ_WRITE` — see the `/output` binding note above.
- `parameters[].name` must not start with the reserved `OPENBAYES_` prefix.
- Any sensitive value (token, key, password) must be submitted as a Secret parameter (`isSecret: true`), never as a plain-text parameter or inside the task `command`.
- `ports`: never map `8080` (auto-provided as `links.auxiliary`) or other reserved ports (full list: `references/workflows/common/container-dev-quickref.md` → Port Exposure). Only map non-reserved custom ports a web app actually needs — SSH/download-only workspaces need no `ports` at all.

## Mutation Guardrails

- Never skip the `create-job` confirmation, even when the user named the resource type.
- Never silently choose a writable dataset binding.
- Never assume project permission without loading project context first when `projectId` targets an existing project.
- Never silently reinterpret `projectName` as an existing project selection.
- Never send ML or `public` tags on create; never retry failed HPC as ML.

## Read-Back

After mutation, reload the created job and summarize:

- job id and mode
- project id or name
- status and substatus
- selected runtime and resource
- confirmed bindings and ports
- access links such as `links.ssh`, `links.workspace` / `links.workspace-with-password`, and `links.frontend` (see `references/ui-links.md` for handling and `Job.password` semantics)

## Confirmation

Before execution, restate:

- owner
- project target
- mode
- runtime
- resource
- bindings
- ports
- any pricing-related assumption

## Failure Translation

- permission error -> the current user cannot create a job in this target
- quota error -> current quota does not cover the requested configuration
- runtime error -> the selected image is unavailable or deprecated
- resource full load -> the selected compute resource is currently full
- parallel limit exceeded -> user has reached their concurrent container limit for this resource ("资源 X 超出个人限制")
- cluster limit exceeded -> the cluster itself has no free slots for this resource ("资源 [X] 超出集群限制"); NOT the user's own limit — capacity is taken by other tenants. Nothing the user can change fixes it: suggest waiting and retrying later, or picking a different resource type. Stopping the user's own containers only helps if they themselves occupy slots of this resource
- binding error -> one of the selected dataset versions cannot be bound
- port error ("该端口不开放") -> a requested port is reserved. `8080` is the auto auxiliary slot (see `references/workflows/common/container-dev-quickref.md` → Port Exposure for the full reserved list); remove it from `ports` — it is auto-provided as `links.auxiliary`. This is **not** a resource-capability limit: every workspace gets `links.auxiliary` regardless of resource type, so do not infer "this resource can't expose web ports" from this error.

## GraphQL Operations

- `references/graphql-operations/compute/create-job.graphql` (+ `create-job.vars.md` — input shape, enums, worked payloads)
- `references/graphql-operations/compute/create-project.graphql`
- `references/graphql-operations/compute/load-job-context.graphql`
- `references/graphql-operations/compute/load-project-context.graphql`
- `references/graphql-operations/common/load-party-context.graphql`
- `references/graphql-operations/common/load-shared-resource-catalog.graphql`
- `references/graphql-operations/common/load-job-runtime-catalog.graphql`
- `references/graphql-operations/common/load-resource-catalog.graphql`
- `references/graphql-operations/common/load-runtime-catalog.graphql`
- `references/graphql-operations/common/load-quota.graphql`
- `references/graphql-operations/dataset/load-dataset-list.graphql`
- `references/graphql-operations/dataset/load-dataset-context.graphql`
