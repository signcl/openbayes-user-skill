---
tier: approval
title: 删除 dataset
effect: 该 dataset 及其所有版本被永久删除，无法恢复
subject: name
highlight: [datasetId]
---

## vars.json

```json
{
  "username": "zhangsan",
  "datasetId": "VZpaD9RA9kf",
  "name": "my-test-set"
}
```

三个变量都必填：只传 `{"id":...}` 会被 GraphQL 层拒掉，三个各报一条 `of required type "String!" was not provided`。

`name` 不是备注，它与 `datasetId` 共同构成删除目标——**先用 `dataset-search-owned.graphql` 读一次拿准确值，别凭记忆拼**。实测：名字对不上时服务端报「数据集名称不匹配」（FAILED_PRECONDITION），dataset 保留——name + id 双确认是服务端真实闸门。

实测（空 dataset，建了即删）：名字匹配时返回 `{"deleteDataset":{"success":true}}`，读回列表 `total: 0`；其余形态（含 `null`）按失败处理，并复查列表确认。
