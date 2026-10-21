# update-job-description variables

`updateJob(userId, jobId, input)` 只改 job 的元数据。`UpdateJobInput` 有三个字段：`description`、`labels`、`useRDMADevices`，本模板的用途是改描述，其余两个不传即不动。不带 manifest 确认档位（理由见 `tests/maintenance/user-mutation-tier-decisions.test.mjs` 的 ALLOWLIST）；作为 mutation 仍按 `graphql-discipline.md` 的通用规则执行。

## vars.json

```json
{
  "userId": "zhangsan",
  "jobId": "job-id",
  "input": {
    "description": "baseline run, lr=3e-4"
  }
}
```

`jobId` 从 `load-my-jobs.graphql` 或 `load-project-jobs.graphql` 读。响应回读 `mode` / `status` / `subStatus`，成功判据是返回的 `description` 等于写入值，不是看状态字段。

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
