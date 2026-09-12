# load-my-jobs variables

`$modes` 默认 `[WORKSPACE, TASK]` 是白名单，故意不含 `SANDBOX`（Agent 基础设施，默认对用户隐藏，规则见 `workflows/compute/list-jobs.md`）。用户点名要看某一 mode 时直接传那一个，不要改成 `[ALL]`。

## vars.json

```json
{
  "username": "zhangsan",
  "page": 1,
  "status": ["ALL"],
  "q": ""
}
```

## vars.running-workspaces.json

```json
{
  "username": "zhangsan",
  "status": ["RUNNING"],
  "q": "",
  "modes": ["WORKSPACE"]
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

## JobModeInput enum values（入参 `$modes`）

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
