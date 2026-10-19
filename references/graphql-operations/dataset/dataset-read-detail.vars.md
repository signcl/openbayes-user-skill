# dataset-read-detail variables

## vars.json

```json
{
  "datasetId": "dataset-id"
}
```

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

## DatasetStatus enum values（响应 `DatasetVersion.status`）

From `references/graphql/schema.graphql`:

- `PROCESSING`
- `VALID`
- `INVALID`

## DatasetSubStatus enum values（响应 `DatasetVersion.subStatus`）

From `references/graphql/schema.graphql`:

- `EMPTY`
- `CLONE`
- `MERGE`
- `UPLOAD`
- `EXCEED_STORAGE_LIMITATION`
- `UNCOMPRESSION_FAILED`
