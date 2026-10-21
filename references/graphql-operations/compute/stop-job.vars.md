---
tier: confirm
title: 停止 job
effect: 运行中的容器被停掉，运行时状态丢失，重启要等一段时间
subject: jobId
---

# stop-job.vars.md

`stopJob(userId, jobId)` 停止一个运行中的 job。响应回读 job 对象（`id` / `name` /
`status` / `subStatus` / `cancellingAt`），判成败看 `status`。

## vars.json

```json
{
  "userId": "zhangsan",
  "jobId": "jKq2mVnQbR4"
}
```

两个变量都必填。`jobId` 从 `load-my-jobs.graphql` 读准确值。
