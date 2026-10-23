# project-search-public variables

## vars.json

```json
{
  "q": "llama",
  "page": 1,
  "tagNames": []
}
```

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
