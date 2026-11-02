# job-metrics variables

`limit` 默认 500，是每个指标最多回读的点数。

## vars.json

```json
{
  "userId": "zhangsan",
  "jobId": "job-id"
}
```

## JobStatus enum values（响应 `Job.status`）

From `references/graphql/schema.graphql`:

- `QUEUED`
- `CREATED`
- `RUNNING`
- `SUCCEEDED`
- `CANCELLED`
- `FAILED`
- `CANCELLING`
