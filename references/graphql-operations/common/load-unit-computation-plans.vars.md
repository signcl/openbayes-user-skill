# load-unit-computation-plans variables

无变量，按量计费套餐目录。

## vars.json

```json
{}
```

GPU 型号（`GPU.type`，52 个值）不在此重复，完整镜像见 `common/load-resource-catalog.vars.md`。

## CPUType enum values（响应 `CPU.type`）

From `references/graphql/schema.graphql`:

- `DEFAULT`
- `HPC_CPU`

## DiskType enum values（响应 `Disk.type`）

From `references/graphql/schema.graphql`:

- `HDD`
- `SSD`
