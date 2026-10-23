# Inspect Job

Use this workflow when the user asks what a job is doing, why it failed, or what can be done next.

## Goal

Load a single job and translate its state into product language.

## Deterministic Steps

1. Normalize the request into `job.read`.
2. Require:
   - `userId`
   - `jobId` — ⚠️ 若来自 console 容器 URL（`/{ns}/containers/{id}`），`{id}` 是 **projectId**（含大写）不是 jobId，直接传会「找不到该资源」。先用 `project(projectId).jobs(userId, projectId, status:[RUNNING], mode:WORKSPACE)` 解析出 jobId，见 `references/workflows/common/container-dev-quickref.md`「从 console 容器 URL 拿到 job」。
3. Load `compute/load-job-context.graphql`.
4. Summarize:
   - job id and name
   - mode
   - status and sub-status
   - runtime and resource
   - project
   - data bindings
   - ports
   - access links if present (`links.frontend`, `links.workspace`, `links.workspace-with-password`, `links.tensorboard`, `links.auxiliary`, `links.live`/`links.websocket`) — **omit `links.sandbox`** (Agent infrastructure; see Guardrails)
5. Infer actionable next steps:
   - if running and `canStop` is true -> stopping is available
   - if finished and restart is allowed by mode -> restart is available
   - if bindings or ports look mismatched -> explain the mismatch before suggesting a mutation
   - if the job serves an app (a `links.auxiliary` value, or mapped `ports`) -> proactively surface the **clickable service URL** (`links.auxiliary` for the 8080 app, or the port's link). Many tutorials are *used* through this URL — lead with it rather than leaving it in the link list. Full open-the-demo flow: `references/workflows/compute/access-job-service.md`.
6. If the user asks "why did it fail", continue into `references/workflows/compute/job-debug-preflight.md`.
7. If the user asks about resource usage / 监控 / metrics (GPU、显存、利用率随时间的变化), load `compute/job-metrics.graphql` with the same `userId`/`jobId`. It returns `[JobMetricSeries]` — each series has `name`, `isSystemMetrics`, and `values[] { value, createdAt }`. `value` is nullable (gaps in a series are normal); empty `metrics` for a non-`RUNNING` job is expected, not an error.

## Guardrails

- Do not expose sensitive fields (e.g., `password`) unless explicitly asked.
- If both `workspace` and `workspace-with-password` are present, explain that `workspace-with-password` is often needed for direct JupyterLab access when `workspace` still prompts for password.
- Explain that runtime access links are port-derived: `auxiliary` is the **default `8080`** endpoint (the user's own app slot — exposed without any mapping), and extra mapped (non-8080) ports may produce extra URLs.
- `links.sandbox` is Agent infrastructure, not a user-facing access link: keep using it internally for container ops (`references/workflows/common/container-dev-quickref.md`), but never list it when presenting links, and mention sandbox only under the exceptions in `references/workflows/compute/list-jobs.md`. It is a separate HTTP/WS agent link, not `auxiliary`; missing sandbox is not restart authorization.
- A job the user references by concrete id is answered as-is even when `mode == SANDBOX` — explicit reference is the exception to the hiding rule in `references/workflows/compute/list-jobs.md`.
- Explain presence conditions: extra mapped URLs (e.g., `port-<port>`, `auxiliary`) are usually available only when job status is `RUNNING` and endpoint provisioning is complete.
- Treat token-bearing links (e.g., `workspace-with-password`) as sensitive; do not print full tokenized URLs unless explicitly requested.
- Prefer explaining mode and resource in product terms rather than raw schema names only.
- Do not recommend admin-only actions.
- 「部署」这类模糊动词先确认是 workspace 启动还是 serving 发布，不要默默切到 serving 操作面。

## GraphQL Operations

- `references/graphql-operations/compute/load-job-context.graphql`
- `references/graphql-operations/compute/job-metrics.graphql` (optional — only when the user asks for monitoring/metric values)
