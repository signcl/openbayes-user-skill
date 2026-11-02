# load-job-context variables

## vars.json

```json
{
  "userId": "zhangsan",
  "jobId": "job-id"
}
```

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

## BindingAuth enum values（响应 `DatasetBinding.bindingAuth`）

From `references/graphql/schema.graphql`:

- `READ_ONLY`
- `READ_WRITE`
