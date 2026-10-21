# load-job-runtime-catalog variables

按 label 拉运行时（镜像）目录，通常先用 `load-resource-catalog.graphql` 读到资源的 `labels` 再传进来。三个变量都可省。

## vars.json

```json
{
  "id": "zhangsan",
  "labels": ["MACHINE_LEARNING"],
  "runtimeType": ["CONTAINER"]
}
```

## RuntimeType enum values（入参 `$runtimeType`）

From `references/graphql/schema.graphql`:

- `CONTAINER`
- `VM`

## DeviceType enum values（响应 `NormalClusterRuntime.device`）

From `references/graphql/schema.graphql`:

- `CPU`
- `GPU`
