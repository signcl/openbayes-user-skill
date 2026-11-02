---
tier: approval
title: 删除 job
effect: 该 job 连同它的运行记录一起永久删除，无法恢复；与停止（stop-job）不同，删除后不可再重启
subject: jobId
highlight: [userId]
---

# job-delete.vars.md

`deleteJob(userId, jobId)` 永久删除一个 job。清理类诉求默认用 `stop-job`（可逆、
不丢记录），删除只在用户明确点名时执行——见 `graphql-discipline.md` 分档。

## vars.json

```json
{
  "userId": "zhangsan",
  "jobId": "jKq2mVnQbR4"
}
```

两个变量都必填。`jobId` 从 `load-my-jobs.graphql` 读准确值。

实测：`jobId` 不存在时报 NOT_FOUND「找不到该资源」，`data` 为 `null`。成功返回
`{"deleteJob":{"success":true}}`（`DeletionStatus`，与 `deleteProject` 同型，成功
形态本身未在真 job 上实测过）。运行中的 job 能否直接删、是否须先 `stop-job`，
**未实测**——首次真删前先拿可丢弃的 job 验证一遍。
