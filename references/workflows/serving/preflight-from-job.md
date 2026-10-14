# Preflight from Job

Use this workflow before creating a serving from an existing job. This is the mandatory first step for any serving creation flow.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation and explain that serving is not enabled for this account.

## Goal

Load source job context, verify runtime/resource compatibility, and prepare binding candidates for serving creation.

## Hard Rules

These shape the payload; the checkable conditions live in Minimum Rollout Gates below, not here.

- **Resource lock**: `serving.resource` must equal source `job.resource`. Job 与 Serving 共用同一份 resource 目录，直接复用源 job 的 `resource.name`，不要再按 deploy 类型筛选。
- **Keep `/output` light** to avoid expensive copy during serving creation.
- **Binding syntax**: follow the canonical binding rules from `SKILL.md` and prefer stable id references over names.
- **Prefix normalization**: treat `/<prefix>/home` as `/output`, and `/<prefix>/input/input*` as `/input*` (determine `<prefix>` from workspace SSH default workdir when needed).

## Minimum Rollout Gates

Before continuing from preflight to serving create/version create, all gates below must pass:

1. Model artifacts are physically present in dataset-version storage (not symlinks that only resolve in one container).
2. At least one model-artifact binding is mounted readonly under `/input*` — large artifacts belong here, never in `/output`.
3. A readonly job-output binding is mounted to `/output`, and `/output/start.sh` exists.
4. `start.sh` contains env-based port switch (`workspace=8080`, `serving=80` when `OPENBAYES_SERVING_PRODUCTION` is set). A rollout without it is rejected — this is the most common serving failure.
5. Control-plane readiness check and data-plane probe both pass before declaring rollout healthy.

## Deterministic Steps

1. Load source job context with `serving/serving-preflight-load-job.graphql`.
2. Verify the job exists, is accessible, and extract:
   - runtime
   - resource
   - bindings
   - startup script
3. Run limitations check per `references/workflows/common/check-limitations.md`:
   - Resource parallel limit for the source job's resource.
4. Run resource preflight with `common/load-resource-catalog.graphql`:
   - Check `affordable: true` and `isFullLoad: false`.
5. If path aliases or mount prefixes are unclear, inspect workspace SSH context first:
   - follow `references/workflows/common/ssh-best-practice.md`
   - check default workdir (`pwd`) and aliases for `/output`, `/input0`, `/<prefix>/home`, `/<prefix>/input/input0`
   - infer `<prefix>` from default workdir and normalize subsequent reasoning to `/output` and `/input*`
6. Normalize GraphQL-returned binding paths to canonical `/output` and `/input*` before validation.
7. Verify the source bindings match serving needs:
   - model artifacts live under `/input*`
   - at least one job-output binding can become `/output`
   - use ids in binding references when hand-writing payloads
8. Verify startup script contains `OPENBAYES_SERVING_PRODUCTION` port switch.
9. Verify model artifacts are dataset-backed entities (not workspace-local symlink shortcuts).
10. If the source job is a tested workspace that will hand off to serving on the same resource, simulate the next-step concurrency impact. If keeping the workspace running would exceed the resource limitation for the new serving, mark a mandatory source-workspace stop before serving rollout.
11. Convert bindings to readonly serving-compatible bindings.
12. Output the validated preflight result for downstream `create-serving` or `create-serving-version` workflows.

## Guardrails

- Treat serving-only resource aliases (e.g., `serving-cpu`) as deprecated; reuse the source job's resource directly.
- If the same resource is temporarily unavailable because the source job is occupying its per-user parallel-limit slots, recommend stopping the job first.
- Never rely on job or dataset names when a stable id reference is already known.

## GraphQL Operations

- `references/graphql-operations/serving/serving-preflight-load-job.graphql`
- `references/graphql-operations/common/load-party-context.graphql`
- `references/graphql-operations/common/load-resource-catalog.graphql`
- `references/graphql-operations/common/load-runtime-catalog.graphql`
