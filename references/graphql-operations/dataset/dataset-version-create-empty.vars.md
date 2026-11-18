---
tier: confirm
title: 创建 dataset 版本
effect: 在指定 dataset 下新建一个空版本
subject: datasetId
---

# dataset-version-create-empty variables

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

## vars.json

```json
{
  "datasetId": "dataset-id"
}
```
