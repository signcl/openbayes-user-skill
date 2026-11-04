---
tier: confirm
title: 更新 serving 配置
effect: 名称、计费率或鉴权开关立即变化，鉴权变化会断线上调用方
subject: id
highlight: [input]
---

# serving-update.vars.md

`updateServing(username, servingId, input)` 改 serving 的配置。`input` 字段全部
可省、传哪个改哪个：`name` / `slug` / `description` / `requestSavingRate` /
`needAuthorization`。

## vars.json

```json
{
  "username": "zhangsan",
  "id": "vycpv1a7wiky",
  "input": {
    "needAuthorization": true
  }
}
```

`id` 从 `serving-list.graphql` 读准确值。
