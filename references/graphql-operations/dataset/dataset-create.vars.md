---
tier: confirm
title: 创建 dataset
effect: 新建一个 dataset，并应用所选类型、描述与标签
subject: name
highlight: [category, tagNames]
---

# dataset-create variables

`tagNames` accepts `TagInput` objects. `editable` and `hidden` have server-side
defaults, so a name-only object is valid.

## DatasetCategory enum values（入参 `category` / 响应 `Dataset.category`）

From `references/graphql/schema.graphql`:

- `DATASET`
- `PRETRAINED_MODEL`
- `CODE`
- `MODEL`
- `OTHERS`

## TagBooleanAttributeInput enum values（入参 `TagInput.editable` / `TagInput.hidden`）

From `references/graphql/schema.graphql`:

- `ALLOW_USER_UPDATE`
- `NOT_ALLOW_USER_UPDATE`
- `USER_INVISIBLE`
- `USER_VISIBLE`

## PublicPermissionLevel enum values（响应 `Permissions.publicPermission`）

From `references/graphql/schema.graphql`:

- `PRIVATE`
- `PUBLIC_READ`
- `PUBLIC_READ_AND_DOWNLOAD`

## OrgPermissionLevel enum values（响应 `Permissions.orgPermission`）

From `references/graphql/schema.graphql`:

- `ORG_PRIVATE`
- `ORG_READ`
- `ORG_READ_AND_DOWNLOAD`
- `ORG_WRITE`

## vars.json

```json
{
  "username": "zhangsan",
  "name": "image-classification",
  "description": "训练数据",
  "category": "DATASET",
  "tagNames": [{ "name": "vision" }]
}
```
