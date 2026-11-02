# dataset-search-public variables

## vars.json

```json
{
  "q": "coco",
  "page": 1,
  "category": ["DATASET"],
  "tagNames": []
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
