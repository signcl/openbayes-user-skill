---
tier: confirm
title: 吊销 serving API key
effect: 用这个 key 的调用立即失败，线上调用方会断
subject: userId
highlight: [id]
---

# serving-apikey-revoke.vars.md

`revokeApiKey(userId, id)` 吊销一个 serving API key。成功返回
`{"revokeApiKey":{"success":true}}`。

## vars.json

```json
{
  "userId": "zhangsan",
  "id": "9Xk2mVnQbR4"
}
```

两个变量都必填。`id` 从 `serving-apikey-list.graphql` 读——它是 key 记录的 id，
不是 key 本身。

