# serving-read-version variables

`version` 是整数版本号，从 `serving-read-overview.graphql` 的 `latestServingVersion.version` 或 `serving-list.graphql` 读。

## vars.json

```json
{
  "username": "zhangsan",
  "id": "vycpv1a7wiky",
  "version": 3
}
```

## ServingVersionStatus enum values（响应 `ServingVersion.status`）

From `references/graphql/schema.graphql`:

- `PREPARING`
- `RUNNING`
- `CANCELLING`
- `CANCELLED`
- `FAILED`

## ServingVersionSubStatus enum values（响应 `ServingVersion.subStatus`）

From `references/graphql/schema.graphql`:

- `EMPTY`
- `TERMINATED`
- `QUOTA_EXHAUSTED`
- `K8S_RESOURCE_NOT_FOUND`
- `READINESS_TIMEOUT`

## ServingVersionInstanceStatus enum values（响应 `ServingVersionInstance.status`）

From `references/graphql/schema.graphql`:

- `PREPARING`
- `RUNNING`
- `CANCELLED`
- `ERROR`

## DeviceType enum values（响应 `ServingRuntime.device`）

From `references/graphql/schema.graphql`:

- `CPU`
- `GPU`

## ServingType enum values（响应 `ServingVersionDataBinding.type`）

From `references/graphql/schema.graphql`:

- `JOB_OUTPUT`
- `DATASET`
- `SOURCE_CODE`

## ServingVersionBindingAuth enum values（响应 `ServingVersionDataBinding.bindingAuth`）

From `references/graphql/schema.graphql`:

- `READ_ONLY`
