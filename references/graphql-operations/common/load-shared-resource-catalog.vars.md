# load-shared-resource-catalog variables

与 `load-resource-catalog.graphql` 同一个字段，`$labels` 默认 `["MACHINE_LEARNING"]`。

## vars.json

```json
{
  "partyId": "zhangsan"
}
```

GPU 型号（`GPU.type`，52 个值）不在此重复，完整镜像见 `common/load-resource-catalog.vars.md`。

## DiskType enum values（响应 `Disk.type`）

From `references/graphql/schema.graphql`:

- `HDD`
- `SSD`
