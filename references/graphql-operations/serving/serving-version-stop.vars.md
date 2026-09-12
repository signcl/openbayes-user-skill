---
tier: confirm
title: 停止 serving 版本
effect: 该版本停止服务，线上调用立即失败，重启慢且状态丢失
subject: id
highlight: [version]
---

# serving-version-stop.vars.md

`stopServingVersion(username, servingId, version)` 停止 serving 的一个版本。响应
回读 `userId` / `servingId` / `version` / `status`（无 `success` 字段，判成败看
`status`）。

## vars.json

```json
{
  "username": "zhangsan",
  "id": "vycpv1a7wiky",
  "version": 3
}
```

三个变量都必填。`id` 与 `version` 从 `serving-read-version.graphql` 读准确值。
