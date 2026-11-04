---
tier: confirm
title: 修改项目权限
effect: 该项目的公开范围与读写权限立即改变
subject: projectId
highlight: [input]
---

# project-update-permissions.vars.md

`updateProjectEntityPermissions(userId, projectId, input)` 修改项目的公开权限与
组织权限，响应回读新的 `permissions`。

## vars.json

```json
{
  "ownerId": "zhangsan",
  "projectId": "Qk3mVnXbR7z",
  "input": {
    "publicPermission": "PRIVATE",
    "orgPermission": "ORG_READ_AND_DOWNLOAD"
  }
}
```

GraphQL 层面 `ownerId` / `projectId` 非空；`input` 在 schema 里可空
（`UpdateProjectEntityPermission` 无 `!`），执行权限更新时由 workflow 要求传入。
`ownerId` 是项目属主的 username，`projectId` 先从项目列表查询读准确值。`orgPermission` 仅当 owner 是 Org 时才设置（写法与冲突规则见
`workflows/compute/update-project-permissions.md`）。

## PublicPermissionLevel enum values (入参 `UpdateProjectEntityPermission.publicPermission` / 响应 `Project.permissions.publicPermission`)

From `references/graphql/schema.graphql`:

- `PRIVATE`
- `PUBLIC_READ`
- `PUBLIC_READ_AND_DOWNLOAD`

## OrgPermissionLevel enum values (入参 `UpdateProjectEntityPermission.orgPermission` / 响应 `Project.permissions.orgPermission`)

From `references/graphql/schema.graphql`:

- `ORG_PRIVATE`
- `ORG_READ`
- `ORG_READ_AND_DOWNLOAD`
- `ORG_WRITE`

`ORG_READ` 在权限写入流程中不使用（workflow 只取 `ORG_PRIVATE` /
`ORG_READ_AND_DOWNLOAD` / `ORG_WRITE`）。

