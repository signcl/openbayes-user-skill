# load-dataset-list variables

自己的与公开的各一页，游标分别是 `page` / `publicPage`。

## vars.json

```json
{
  "partyId": "zhangsan",
  "q": "",
  "category": ["ALL"],
  "scope": "ALL",
  "page": 1,
  "publicPage": 1
}
```

## DatasetCategoryInput enum values（入参 `$category`）

From `references/graphql/schema.graphql`:

- `DATASET`
- `PRETRAINED_MODEL`
- `CODE`
- `OTHERS`
- `MODEL`
- `ALL`

`ALL` 只在入参侧存在，响应 `Dataset.category` 是另一个 enum（见下）。

## DatasetScopeInput enum values（入参 `$scope`）

From `references/graphql/schema.graphql`:

- `PUBLIC`
- `ALL`

## DatasetCategory enum values（响应 `Dataset.category`）

From `references/graphql/schema.graphql`:

- `DATASET`
- `PRETRAINED_MODEL`
- `CODE`
- `MODEL`
- `OTHERS`

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
