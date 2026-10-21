---
tier: approval
title: 删除 serving 版本
effect: 该版本被永久删除，无法恢复
subject: id
highlight: [version]
---

# serving-version-delete.vars.md

`deleteServingVersion(userId, servingId, version)` 删除 serving 的一个版本。成功返回
`{"deleteServingVersion":{"success":true}}`；其余形态（含 `null`）按失败处理。

## vars.json

```json
{
  "username": "zhangsan",
  "id": "vycpv1a7wiky",
  "version": 3
}
```

三个变量都必填。`id` 是所属 serving 的 id、`version` 是版本号（`Int`），都从
`serving-read-version.graphql` / `serving-list.graphql` 读，别凭记忆拼。

