# Serving log context

Read-only discovery used by `scripts/read_serving_logs.mjs`. This query returns links, not log content; follow `references/workflows/serving/read-serving-logs.md` to consume them.

```json
{"username":"zhangsan","id":"abc123def456","version":1}
```

`username` is the serving owner (user or organization), not necessarily the current login username. `version` is the numeric serving version. The operation selects no enum fields and accepts no enum variables.
