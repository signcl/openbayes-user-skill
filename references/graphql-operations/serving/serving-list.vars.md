# serving-list variables

## vars.json

```json
{
  "username": "zhangsan",
  "page": 1,
  "q": "",
  "status": ["ALL"]
}
```

## ServingVersionStatusInput enum values（入参 `$status`）

From `references/graphql/schema.graphql`:

- `PREPARING`
- `RUNNING`
- `CANCELLING`
- `CANCELLED`
- `FAILED`
- `ALL`

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
