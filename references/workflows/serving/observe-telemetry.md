# Observe Serving Telemetry

Use this workflow to monitor serving health and performance through metrics, traces, and events. For container logs, startup errors or HTTP 502, first follow `read-serving-logs.md` (historical HTTP logs and bounded live samples); telemetry is not a substitute for logs.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled for the current user/org:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Goal

Query serving telemetry to assess health, latency, and throughput. Prioritize LLM-specific telemetry for LLM servings.

## Telemetry Priority

Determine telemetry mode from serving links first:

- if `serving.links` contains `llm`, treat it as an LLM serving and run `llm*` telemetry as primary
- if `llm` is absent, use general telemetry and endpoint probes as primary

### Primary (LLM-first)

For LLM-link servings, use these as the primary signal:

- `llmEvents` (`serving/serving-observe-llm-events.graphql`)
- `llmLatencyTraces` (`serving/serving-observe-llm-latency.graphql`)
- `llmTTFTTraces` (`serving/serving-observe-llm-ttft.graphql`)
- `llmTotalTokenTraces` (`serving/serving-observe-llm-total-token.graphql`)

### Secondary (general)

Use these as secondary supporting evidence:

- `metricsByPod` (`serving/serving-observe-metrics.graphql`)
- `traces` (`serving/serving-observe-traces.graphql`)
- `events` (`serving/serving-observe-events.graphql`)

## Time & Resolution Format

`from` / `to` only accept three forms:

- relative offset matching `^(-?\d+)([smhdw])$`: `-30m`, `-1h`, `-24h`, `-3d`, `-1w`
- millisecond timestamp as a digits-only string: `"1746000000000"`
- the literal `now`

**ISO 8601 strings (`"2026-04-30T00:00:00Z"`) are NOT accepted**. They are silently coerced to the current time, which collapses the window to zero and returns empty results without any error. Always use relative offsets or ms timestamps.

`resolution` follows the same `^(\d+)([smhdw])$` shape (`60s`, `16m`, `1h`, `1d`). Granularity only affects bucket count; it does not affect whether data exists.

## Metrics Query Practice

- Start with `from=-30m, to=now, resolution=60s`.
- If empty, widen to `from=-24h, to=now` or `from=-3d, to=now, resolution=16m`.
- Treat metrics as secondary evidence, not sole readiness gate.
- If a query returns empty unexpectedly, first verify `from`/`to` are in an accepted format (see above) — silent ISO failure is the most common cause.

## Known Risk

- In current environment, secondary telemetry (`metricsByPod`, `traces`, `events`) can be empty while endpoint and LLM telemetry are healthy.
- For LLM-link servings, frontend trace flow prioritizes `llm*` traces and does not use traditional `traces` in the traces tab.
- `llmEvents` and `llm*Traces` are backed by different data paths and use subtly different filtering semantics. `llm*Traces` returning non-zero counts does not guarantee `llmEvents` returns rows for the same window — investigate `tail` and the time format before concluding "no data".
- Treat empty general telemetry as a platform-risk warning, not an immediate serving failure.
- For go/no-go decisions, prioritize: endpoint probe success + non-empty `llmEvents`/`llm*Traces`.

## Recommended Vars Templates

Common identity vars:

```json
{
  "username": "<username>",
  "id": "<servingId>",
  "version": 1
}
```

Metrics vars (`serving-observe-metrics.graphql`):

```json
{
  "username": "<username>",
  "id": "<servingId>",
  "version": 1,
  "from": "-30m",
  "to": "now",
  "resolution": "60s"
}
```

Traces vars (`serving-observe-traces.graphql`):

```json
{
  "username": "<username>",
  "id": "<servingId>",
  "version": 1,
  "from": "-30m",
  "to": "now",
  "resolution": "60s",
  "method": "POST"
}
```

Events vars (`serving-observe-events.graphql`):

```json
{
  "username": "<username>",
  "id": "<servingId>",
  "version": 1,
  "from": "-30m",
  "to": "now",
  "tail": 100
}
```

LLM traces vars (`serving-observe-llm-*.graphql`):

```json
{
  "username": "<username>",
  "id": "<servingId>",
  "version": 1,
  "from": "-30m",
  "to": "now",
  "resolution": "60s"
}
```

LLM events vars (`serving-observe-llm-events.graphql`):

```json
{
  "username": "<username>",
  "id": "<servingId>",
  "version": 1,
  "from": "-30m",
  "to": "now",
  "tail": 100
}
```

If metrics/traces/events are empty, retry once with a wider window:

```json
{
  "from": "-24h",
  "to": "now"
}
```

## GraphQL Operations

- `references/graphql-operations/serving/serving-observe-metrics.graphql`
- `references/graphql-operations/serving/serving-observe-traces.graphql`
- `references/graphql-operations/serving/serving-observe-events.graphql`
- `references/graphql-operations/serving/serving-observe-llm-latency.graphql`
- `references/graphql-operations/serving/serving-observe-llm-ttft.graphql`
- `references/graphql-operations/serving/serving-observe-llm-total-token.graphql`
- `references/graphql-operations/serving/serving-observe-llm-events.graphql`
