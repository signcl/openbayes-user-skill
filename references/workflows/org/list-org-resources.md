# List Org Resources

Use this workflow when the user wants to see the datasets / projects / jobs / servings under an org (not their personal scope) — typical phrasings: "<org> 的数据集", "组织里的 jobs", "show me datasets in <org>", "openbayes-team 有什么 project".

## Goal

Route the caller to the right existing list workflow / GraphQL template, with the org id substituted for the party id. **No new GraphQL templates are introduced**—schema's `Query.party(id: ID!): Party` accepts both User and Org, and existing list templates already use this pattern.

## Scope

- Read-only.
- Each resource type has its own list workflow / template; this document only routes.
- Permission semantics: server filters results by caller's relationship to the org (member/non-member) and each resource's `orgPermission`. Don't try to predict client-side; trust what the server returns.

## Prechecks

1. Bootstrap to know `me.username` and `me.orgs[].role` for context (e.g., "you're a MEMBER of <org>, so you'll only see resources visible to org members").
2. Resolve the target by `id` (org's `id`, e.g., `openbayes-team`); if user gave displayName, run `list-my-orgs.md` first.

## Routing Table

| User intent | 复用模板 | 现有 workflow | 备注 |
|-------------|----------|----------------|------|
| 列 org 名下的 datasets | `dataset/load-dataset-list.graphql` 或 `dataset/dataset-search-party.graphql` | `dataset/search-datasets.md` | 把 `$partyId` / `$username` 设为 `orgId` |
| 列 org 名下的 jobs | `compute/load-my-jobs.graphql` | `compute/list-jobs.md` | 把 `$username` 设为 `orgId`；该 workflow 已声明支持 org 场景 |
| 列 org 名下的 servings | `serving/serving-list.graphql` | （无独立 workflow，可直接调模板）| 把 `$username` 设为 `orgId` |
| 列 org 名下的 projects | （现有 graphql-operations/ 下没有 list-projects 模板）| —— | 用下方 inline query |

### Inline projects query（无现成模板时使用）

```graphql
query OrgProjects(
  $orgId: ID!
  $q: String! = ""
  $page: Int! = 1
  $perPage: Int! = 30
) {
  party(id: $orgId) {
    id
    ... on Org {
      projects(q: $q, page: $page, perPage: $perPage) {
        data {
          id
          name
          description
          jobCount
          owner { id displayName }
          permissions {
            publicPermission
            orgPermission
          }
        }
        pageInfo { current total next prev }
      }
    }
  }
}
```

按需裁剪字段（参考 SKILL.md 的 GraphQL Field Trimming 章节）。

## Deterministic Steps

1. Determine resource type from user phrasing (datasets / projects / jobs / servings).
2. Pick the corresponding row from the routing table above.
3. Substitute `partyId` / `username` argument with the org's `id`. Argument names in existing templates are historical (`username`); the field they're passed to (`party(id: ...)`) takes any Party id.
4. Apply the existing list workflow's `Status Recipes` / `Category Filtering` rules unchanged. 数据集、项目、任务、部署各列表的 `pageInfo.total` 都是当前条件下可见资源的总个数；全量请求按各自的 `next` 翻到 `0`。总页数按实际每页条数计算，见 `references/graphql-discipline.md`「分页字段与计数」。
5. When summarizing, **explicitly state the scope**: "These are resources in org `<org>`, not your personal resources" — to prevent confusion when the user is also an OWNER and personal scope and org scope overlap.

## Guardrails

- 不要新建 graphql 模板——既有 party-based 模板已覆盖。
- 不要过滤掉用户没创建的资源：列 org 资源时返回的是"我能看到的所有该 org 资源"，不只是我创建的。如果用户只想看自己创建的，提示他用现有的 owned-scope 工作流。
- 写操作（创建/修改/删除）不在本 workflow 范围；走对应资源类型自身的 workflow（例如 `dataset/create-dataset.md` 等），传入 `ownerId = orgId` 即可在 org 名下创建（前提是 `org.canCreateDataset == true`）。

## GraphQL Operations

复用既有：

- `references/graphql-operations/dataset/load-dataset-list.graphql`
- `references/graphql-operations/dataset/dataset-search-party.graphql`
- `references/graphql-operations/compute/load-my-jobs.graphql`
- `references/graphql-operations/serving/serving-list.graphql`

不引入新模板。

## Concept References

- `references/concepts/org-management.md` —— caller 在 org 中的角色含义
- `references/concepts/org-permissions.md` —— org-owned 资源的 `orgPermission` 决定 caller 能不能看到具体资源
