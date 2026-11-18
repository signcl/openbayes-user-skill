# Create Task

Use this workflow when the user wants to run a non-interactive task as a normal user.

## Goal

Create a `Job(mode=TASK)` with deterministic preflight and task-specific payload shape.

## Intent Mapping

- "create a task"
- "跑个任务"
- "训练任务"
- "batch run" (when user means normal task, not batch-task variant)

## Payload Contract

Base mutation:

- `createJob(userId, input: CreateJobInput)`

Task-specific rules:

- `input.mode` must be `TASK`.
- Prefer including `input.newTask` in deterministic payloads:
  - use `newTask: {}` when no task command is provided
  - use `newTask.command` when the user explicitly provides a startup command

Common fields (`runtime`, `resource`, `projectId/projectName`, `dataBindings`, `ports`, `parameters` (environment variables / Secret), `tagNames`) follow `create-job.md`.

## Deterministic Steps

1. Normalize intent to `mode=TASK`.
2. Run shared preflight and validation rules from `references/workflows/compute/create-job.md`.
3. Build `CreateJobInput` with task-specific fields:
   - `mode: "TASK"`
   - `newTask: {}` or `newTask: { "command": "..." }`
4. 复述最终配置与计费后果并取得肯定答复；即使资源型号由用户点名也不能跳过确认。
5. Execute `compute/create-job.graphql` using user scope only.
6. Read back using `compute/load-job-context.graphql`.
7. Summarize job id, status, bindings, and ports.

## Guardrails

- Never infer a destructive task command without explicit user confirmation.
- Never use admin scope for this workflow.
- Never skip confirmation, even when the user named the resource type.

## GraphQL Operations

- `references/graphql-operations/compute/create-job.graphql`
- `references/graphql-operations/compute/load-job-context.graphql`
- Shared preflight operations listed in `references/workflows/compute/create-job.md`
