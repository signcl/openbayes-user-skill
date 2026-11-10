---
tier: approval
title: 删除 project
effect: 该 project 及其内部全部 job 被永久删除，无法恢复
subject: name
highlight: [projectId]
---

# project-delete.vars.md

`deleteProject(userId, projectId, name)` 永久删除一个 project。`name` 不是备注，
它与 `projectId` 共同构成删除目标——**先用 `project-search-by-tags.graphql` 读一次
拿准确值，别凭记忆拼**。

## vars.json

```json
{
  "userId": "zhangsan",
  "projectId": "VZpaD9RA9kf",
  "name": "my-probe-project"
}
```

`projectId` 与 `name` 必填，缺失由 `run_graphql` 本地拦截（`MISSING_VARIABLES`，不发请求）；`userId`
可省略（自动填充；org 属主显式传）。

实测（空 project，建了即删）：名字与 id 不匹配时服务端报「项目名称不匹配」
（FAILED_PRECONDITION），`deleteProject` 回 `null`，project 保留——name + id 双
确认是服务端真实闸门，不是文档摆设。名字匹配时返回
`{"deleteProject":{"success":true}}`，读回项目列表 `total: 0`。project 内还有
job / dataset 时能否直接删、是否须先清空，**未实测**——别赌，先逐个清理再删壳。
