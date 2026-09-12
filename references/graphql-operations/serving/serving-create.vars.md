---
tier: confirm
title: 创建 serving
effect: 新建 serving 资源，部署版本后按用量计费
subject: input.name
---

# serving-create.vars.md

`createServing(username, input)` 创建一个 serving 资源。`input` 字段：`name` /
`runtime` / `resource` / `dataBindings` / `replica` 必填，`description` 可省。

## vars.json

```json
{
  "username": "zhangsan",
  "input": {
    "name": "my-demo-serving",
    "runtime": "<runtime-id-from-catalog>",
    "resource": "<resource-id-from-catalog>",
    "dataBindings": [],
    "replica": 1
  }
}
```

`runtime` / `resource` 先查运行时与资源目录再填（同 job 创建用的目录）。

## ServingDataType enum values (入参 `ServingDataBindingInput.bindingType`)

From `references/graphql/schema.graphql`:

- `JOB_OUTPUT`
- `DATASET`

## ServingBindingAuth enum values (入参 `ServingDataBindingInput.bindingAuth`)

From `references/graphql/schema.graphql`:

- `READ_ONLY`
