# serving-read-overview variables

## vars.json

```json
{
  "username": "zhangsan",
  "id": "vycpv1a7wiky"
}
```

## ServingVersionStatus enum values（响应 `Serving.status` / `ServingVersion.status`）

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
