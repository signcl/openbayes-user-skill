---
tier: confirm
title: 更新 serving API key
effect: key 的名称、类型与绑定范围立即变化，线上调用方可能开始失败
subject: userId
highlight: [id, input]
---

# serving-apikey-update.vars.md

`updateApiKey(userId, id, input)` 改一个 serving API key 的名称、类型或绑定的
serving 范围。响应回读 `id`。

## vars.json

```json
{
  "userId": "zhangsan",
  "id": "9Xk2mVnQbR4",
  "input": {
    "name": "demo-key",
    "keyType": "SERVING",
    "servingIds": ["vycpv1a7wiky"]
  }
}
```

三个变量都必填；`input.keyType` 必填，`name` / `servingIds` 可省。`id` 从
`serving-apikey-list.graphql` 读。

## KeyType enum values (入参 `UpdateApiKeyInput.keyType`)

From `references/graphql/schema.graphql`:

- `SERVING`
- `USER_LEVEL`

