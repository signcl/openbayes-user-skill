# load-resource-catalog variables

拉当前 party 可见的算力资源目录。`partyId` 省略时按调用者身份；`labels` 省略时不过滤。

## vars.json

```json
{
  "partyId": "zhangsan"
}
```

## DiskType enum values（响应 `Disk.type`）

From `references/graphql/schema.graphql`:

- `HDD`
- `SSD`

## GPUType enum values（响应 `GPU.type`）

From `references/graphql/schema.graphql`:

- `DEFAULT`
- `TITAN_V`
- `GTX_1080_TI`
- `RTX_2080`
- `RTX_3090`
- `RTX_4090`
- `RTX_4090_48`
- `RTX_5090`
- `RTX_PRO_6000_BLACKWELL_SERVER`
- `RTX_PRO_6000_BLACKWELL_MAX_Q`
- `RTX_PRO_5000_BLACKWELL`
- `RTX_5880_ADA`
- `VGPU`
- `V100`
- `P100`
- `T4`
- `V100_32`
- `TITAN_XP`
- `TITAN_RTX`
- `K80`
- `K80_12`
- `GTX_1050_MOBILE`
- `T20`
- `I20`
- `H100_80`
- `H100_96`
- `H200_141`
- `H800_80`
- `A100_80`
- `A100_80_MIG_1G_10G`
- `A100_80_MIG_2G_20G`
- `A100_80_MIG_3G_40G`
- `A100_80_MIG_4G_40G`
- `A800_80`
- `A6000`
- `A30`
- `A30_MIG_1G_6G`
- `A30_MIG_2G_12G`
- `A100_40`
- `A100_40_MIG_1G_5G`
- `A100_40_MIG_2G_10G`
- `A100_40_MIG_3G_20G`
- `A100_40_MIG_4G_20G`
- `RTX_2060_6`
- `RTX_2060_12`
- `A40`
- `RTX_8000`
- `ASCEND_910B_64`
- `HYGON_BW150_64`
- `HYGON_K100_64`
- `ASCEND_310P_44`
- `BPU`
