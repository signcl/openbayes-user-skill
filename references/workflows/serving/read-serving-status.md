# Read Serving Status

Use this workflow to check serving and serving version readiness after creation or at any time.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Validate serving readiness across both control-plane and data-plane, and extract endpoint URLs.

## Main Entity

- Primary aggregate root: `Serving`
- Related runtime sub-entity: `ServingVersion`

## Required Reads

Load both serving-level and serving-version-level snapshots:

- `serving/serving-read-overview.graphql`
- `serving/serving-read-version.graphql`

This is a user-scope workflow. Do not use admin-global serving operations for
known serving IDs unless the user explicitly asks for platform-wide admin data.

## Read Conditions

This is a read workflow, but it still depends on entity affordance semantics:

- `party.features` must contain `SERVING`
- serving-level status determines whether deeper readiness checks are meaningful
- serving-version instance readiness determines whether follow-up probe should run

## Dual-Plane Readiness Check

### Control-plane pass

All conditions must be true:

- `serving.status = RUNNING`
- `servingVersion.status = RUNNING`
- At least one `servingVersionInstances[].ready = true`

### Data-plane pass

- Endpoint is available from `serving.links` (at least `http` link).
- At least one successful architecture-aware probe request.

For OpenAI-compatible LLM deployments such as vLLM or SGLang, run lightweight probes in this order:

1. `GET /v1/models`
2. `POST /v1/chat/completions` with a minimal prompt and small `max_tokens`

For custom services, derive the probe from the startup contract:

- declared routes in `start.sh`
- README or service docs
- application health endpoints such as `/health`, `/ready`, or `/ping`

Accept `2xx` as pass. A transient `5xx` or `Bad Gateway` immediately after control-plane readiness may be a gateway propagation delay; retry before declaring startup failure.

## Deterministic Steps

1. Query `serving/serving-read-overview.graphql` for serving-level status and links.
2. Query `serving/serving-read-version.graphql` for version-level status and instances.
3. Check control-plane conditions.
4. Extract endpoint links (`http`, `llm`, `livelog`). For logs or HTTP 502, follow `read-serving-logs.md`; a link alone is not a log-reading procedure.
5. If `llm` link exists, classify it as LLM serving and prepare to use LLM telemetry (`llmEvents`, `llmLatencyTraces`, `llmTTFTTraces`, `llmTotalTokenTraces`) as primary observability signals.
6. Choose a probe strategy from runtime, startup script, and service architecture.
7. If control-plane is ready, probe the data-plane endpoint and retry short-lived gateway failures.
8. Report combined readiness result, and present available links clearly:
   - `frontend` when present
   - runtime endpoints (`http`, `llm`, `livelog`) when present

## Guardrails

- RUNNING status alone is not sufficient. Both planes must pass.
- Do not declare success without data-plane probe.
- Do not require `/v1/models` for services that are not OpenAI-compatible.
- Do not assume `frontend` is always present on serving read responses; use runtime links (`http`, `llm`, `livelog`) as primary operational endpoints.
- Treat `llm` link presence as a strong signal that LLM telemetry endpoints should be included in health analysis.

## GraphQL Operations

- `references/graphql-operations/serving/serving-list.graphql` — list the current user's servings (paged, filter by `q` and `status`)
- `references/graphql-operations/serving/serving-read-overview.graphql`
- `references/graphql-operations/serving/serving-read-version.graphql`
- When summarizing list entries, include the console URL per `references/ui-links.md`.

For listing, `$username` comes from bootstrap (`me.username`). Use `status: [RUNNING]` to narrow to live servings; default `[ALL]` returns every status.
