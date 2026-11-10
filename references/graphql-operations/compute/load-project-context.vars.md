# load-project-context variables

## vars.json

```json
{
  "projectId": "project-id"
}
```

## PublicPermissionLevel enum values（响应 `Permissions.publicPermission`）

From `references/graphql/schema.graphql`:

- `PRIVATE`
- `PUBLIC_READ`
- `PUBLIC_READ_AND_DOWNLOAD`

## OrgPermissionLevel enum values（响应 `Permissions.orgPermission`）

From `references/graphql/schema.graphql`:

- `ORG_PRIVATE`
- `ORG_READ`
- `ORG_READ_AND_DOWNLOAD`
- `ORG_WRITE`

## JobMode enum values（响应 `Job.mode`）

From `references/graphql/schema.graphql`:

- `WORKSPACE_SNAPSHOT`
- `WORKSPACE`
- `TASK`
- `VIRTUAL_MACHINE`
- `BATCH_TASK`
- `BATCH_WORKSPACE`
- `SANDBOX`

## JobStatus enum values（响应 `Job.status`）

From `references/graphql/schema.graphql`:

- `QUEUED`
- `CREATED`
- `RUNNING`
- `SUCCEEDED`
- `CANCELLED`
- `FAILED`
- `CANCELLING`

## JobSubStatus enum values（响应 `Job.subStatus`）

From `references/graphql/schema.graphql`:

- `EMPTY`
- `TERMINATED`
- `TIMEOUT`
- `QUOTA_EXHAUSTED`
- `FETCHING_DATA`
- `INIT_CONTAINER`
- `EXCEED_STORAGE_LIMITATION`
- `CLONE`
- `PULLING`
- `SYNC`
- `SCHEDULE_FAILED`
- `SUBSCRIPTION_CANCELLED`
- `FREE_CPU_LIMIT_EXCEEDED`
- `K8S_RESOURCE_NOT_FOUND`
