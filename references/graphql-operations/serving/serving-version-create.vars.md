---
tier: confirm
title: 部署 serving 版本
effect: 部署一个新版本上线，按所选资源与副本数计费
subject: id
highlight: [input]
---

# serving-version-create.vars.md

`createServingVersion(username, servingId, input)` 给 serving 部署一个新版本。
`input` 字段：`runtime` / `resource` / `dataBindings` / `replica` 必填，
`description` 可省。

## vars.json

```json
{
  "username": "zhangsan",
  "id": "vycpv1a7wiky",
  "input": {
    "runtime": "<runtime-id-from-catalog>",
    "resource": "<resource-id-from-catalog>",
    "dataBindings": [],
    "replica": 1
  }
}
```

`id` 是所属 serving 的 id，从 `serving-list.graphql` 读准确值；`runtime` /
`resource` 先查目录再填。

## ServingDataType enum values (入参 `ServingDataBindingInput.bindingType`)

From `references/graphql/schema.graphql`:

- `JOB_OUTPUT`
- `DATASET`

## ServingBindingAuth enum values (入参 `ServingDataBindingInput.bindingAuth`)

From `references/graphql/schema.graphql`:

- `READ_ONLY`
