# project-search-by-tags variables

`scope` 与 `write` 都可省；`write: true` 只要有写权限的项目。

## vars.json

```json
{
  "ownerId": "zhangsan",
  "q": "",
  "page": 1,
  "tagNames": ["vision"]
}
```

## DatasetScopeInput enum values（入参 `$scope`）

From `references/graphql/schema.graphql`:

- `PUBLIC`
- `ALL`

名字带 Dataset，但 `party.projects` 的 `scope` 用的就是这个类型。

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
