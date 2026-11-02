---
tier: approval
title: 删除 serving
effect: 该 serving 被永久删除，无法恢复
subject: name
highlight: [id]
---

# serving-delete.vars.md

`deleteServing(userId, servingId, name)` 删除 serving 本体，是整套清理流程的最后
一步：**所有版本须先停止并删除**，否则先走 `stop-serving-version` →
`delete-serving-version`（见 `workflows/serving/delete-serving.md`）。成功返回
`{"deleteServing":{"success":true}}`；其余形态（含 `null`）按失败处理，并复查
`serving-list.graphql` 确认。

## vars.json

```json
{
  "username": "zhangsan",
  "id": "vycpv1a7wiky",
  "name": "my-demo-serving"
}
```

三个变量都必填。`id` 与 `name` 先用 `serving-list.graphql` 读一次拿准确值，别凭记忆拼。

