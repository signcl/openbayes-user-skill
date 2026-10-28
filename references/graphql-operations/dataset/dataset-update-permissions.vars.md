---
tier: confirm
title: 修改 dataset 权限
effect: 该 dataset 的公开范围与读写权限立即改变
subject: datasetId
highlight: [input]
---

# dataset-update-permissions.vars.md

`updateDatasetPermissions(userId, datasetId, input)` 修改 dataset 的公开权限与组织
权限，响应回读新的 `permissions`。

## vars.json

```json
{
  "ownerId": "zhangsan",
  "datasetId": "VZpaD9RA9kf",
  "input": {
    "publicPermission": "PRIVATE",
    "orgPermission": "ORG_READ_AND_DOWNLOAD"
  }
}
```

三个变量都必填。`ownerId` 是 dataset 属主的 username，`datasetId` 先用
`dataset-search-owned.graphql` 读准确值。`orgPermission` 仅当 owner 是 Org 时才设置
（写法与冲突规则见 `workflows/dataset/update-dataset-permissions.md`）。

## PublicPermissionLevel enum values (入参 `DatasetPermissionInput.publicPermission` / 响应 `Dataset.permissions.publicPermission`)

From `references/graphql/schema.graphql`:

- `PRIVATE`
- `PUBLIC_READ`
- `PUBLIC_READ_AND_DOWNLOAD`

## OrgPermissionLevel enum values (入参 `DatasetPermissionInput.orgPermission` / 响应 `Dataset.permissions.orgPermission`)

From `references/graphql/schema.graphql`:

- `ORG_PRIVATE`
- `ORG_READ`
- `ORG_READ_AND_DOWNLOAD`
- `ORG_WRITE`

`ORG_READ` 在权限写入流程中不使用（workflow 只取 `ORG_PRIVATE` /
`ORG_READ_AND_DOWNLOAD` / `ORG_WRITE`）。

