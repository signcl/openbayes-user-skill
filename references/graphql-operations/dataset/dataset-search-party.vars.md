# dataset-search-party variables

`username` 传 org id 时列的是该组织名下的 dataset。

## vars.json

```json
{
  "username": "org-id",
  "q": "",
  "page": 1,
  "category": ["ALL"]
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
