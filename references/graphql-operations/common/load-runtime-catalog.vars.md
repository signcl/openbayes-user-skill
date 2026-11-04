# load-runtime-catalog variables

与 `load-job-runtime-catalog.graphql` 同一个字段，多回读 `runtimeType`；`$runtimeType` 默认 `[CONTAINER, VM]`。

## vars.json

```json
{
  "partyId": "zhangsan",
  "labels": ["MACHINE_LEARNING"]
}
```

## RuntimeType enum values（入参 `$runtimeType` / 响应 `NormalClusterRuntime.runtimeType`）

From `references/graphql/schema.graphql`:

- `CONTAINER`
- `VM`

## DeviceType enum values（响应 `NormalClusterRuntime.device`）

From `references/graphql/schema.graphql`:

- `CPU`
- `GPU`
