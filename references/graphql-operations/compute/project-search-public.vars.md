# project-search-public variables

## vars.json

```json
{
  "q": "llama",
  "page": 1,
  "tagNames": []
}
```


## `$perPage`（默认 30，上限 100）

教程目录拉全量：`tagNames: ["public"]` + `perPage: 100`，通常两页拉完；仍按 `next` 翻到尽；规则见 `references/graphql-discipline.md`「分页字段与计数」。

## PublicPermissionLevel enum values（响应 `Permissions.publicPermission`）

From `references/graphql/schema.graphql`:

- `PRIVATE`
- `PUBLIC_READ`
- `PUBLIC_READ_AND_DOWNLOAD`

## JobMode enum values（响应 `Job.mode`）

From `references/graphql/schema.graphql`:

- `WORKSPACE_SNAPSHOT`
- `WORKSPACE`
- `TASK`
- `VIRTUAL_MACHINE`
- `BATCH_TASK`
- `BATCH_WORKSPACE`
- `SANDBOX`
