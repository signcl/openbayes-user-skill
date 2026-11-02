---
tier: confirm
title: 创建项目
effect: 新建一个项目，并应用所选描述与标签
subject: name
highlight: [description, tagNames]
---

# create-project variables

`tagNames` accepts `TagInput` objects. `editable` and `hidden` have server-side
defaults, so a name-only object is valid.

## TagBooleanAttributeInput enum values（入参 `TagInput.editable` / `TagInput.hidden`）

From `references/graphql/schema.graphql`:

- `ALLOW_USER_UPDATE`
- `NOT_ALLOW_USER_UPDATE`
- `USER_INVISIBLE`
- `USER_VISIBLE`

## vars.json

```json
{
  "userId": "zhangsan",
  "name": "vision-demo",
  "description": "图像分类实验",
  "tagNames": [{ "name": "vision" }]
}
```
