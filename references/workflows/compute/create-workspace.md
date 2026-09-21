# Create Workspace

Use this workflow when the user wants to create an interactive workspace as a normal user.

## Goal

Create a `Job(mode=WORKSPACE)` with a deterministic payload contract and user-scope validation.

## Intent Mapping

- 「创建容器 / 开个容器 / 帮我开台机器 / create a workspace / 创建工作空间」

Default all ambiguous "container/workspace" requests to workspace mode unless the user explicitly asks for task or VM semantics.

## Payload Contract

Base mutation:

- `createJob(userId, input: CreateJobInput)`

Workspace-specific rules:

- `input.mode` must be `WORKSPACE`.
- `input.newWorkspace` must be present.
- If the user did not request persistence, set `newWorkspace: {}`.
- If the user explicitly requests persistence and feature gate passes, set:
  - `newWorkspace.persistent: true`
  - `newWorkspace.renewable: true` or user-requested value

Common fields (`runtime`, `resource`, `projectId/projectName`, `dataBindings`, `ports`, `parameters` (environment variables / Secret), `tagNames`) follow `create-job.md`.

## Deterministic Steps

1. Normalize intent to `mode=WORKSPACE`.
2. Run shared preflight and validation rules from `references/workflows/compute/create-job.md`:
   - project permission
   - resource/runtime catalog validation
   - limitations and quota explanation
   - binding and port validation
3. Build `CreateJobInput` with workspace-specific fields:
   - `mode: "WORKSPACE"`
   - `newWorkspace: {}` (or explicit persistence payload)
4. 复述最终配置与计费后果并取得肯定答复；即使资源型号由用户点名也不能跳过确认（见 `create-job.md`）。
5. Execute `compute/create-job.graphql` using user scope only.
6. Read back using `compute/load-job-context.graphql`.
7. Summarize job id, status, links, bindings, and ports.

## Guardrails

- Never omit `newWorkspace` in workspace create payloads.
- Never enable persistence unless the user explicitly asks and the feature gate passes.
- Never use admin scope for this workflow.
- Never skip confirmation, even when the user named the resource type.

## GraphQL Operations

- `references/graphql-operations/compute/create-job.graphql`
- `references/graphql-operations/compute/load-job-context.graphql`
- Shared preflight operations listed in `references/workflows/compute/create-job.md`
