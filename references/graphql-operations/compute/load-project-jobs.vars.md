# load-project-jobs variables

与 `load-my-jobs.graphql` 的区别：按 project 取，`$mode` 是单值而非数组，且默认 `ALL` 会带出 `SANDBOX`，展示前按 `workflows/compute/list-jobs.md` 剔除。`labelKeys` 只按 key 过滤。

## vars.json

```json
{
  "projectId": "project-id",
  "userId": "zhangsan",
  "page": 1,
  "perPage": 30,
  "status": ["ALL"],
  "mode": "ALL"
}
```

## JobStatusInput enum values（入参 `$status`）

From `references/graphql/schema.graphql`:

- `QUEUED`
- `CREATED`
- `RUNNING`
- `SUCCEEDED`
- `CANCELLED`
- `FAILED`
- `CANCELLING`
- `ALL`

## JobModeInput enum values（入参 `$mode`）

From `references/graphql/schema.graphql`:

- `WORKSPACE_SNAPSHOT`
- `WORKSPACE`
- `TASK`
- `ALL`
- `VIRTUAL_MACHINE`
- `BATCH_TASK`
- `BATCH_WORKSPACE`
- `SANDBOX`

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

## DeviceType enum values（响应 `Runtime.device`）

From `references/graphql/schema.graphql`:

- `CPU`
- `GPU`
