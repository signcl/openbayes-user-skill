# Resource Visibility — Public Permission Model

公开度（`publicPermission`）控制"对外面任何人"的可见性。本文档只讲 `publicPermission`。

组织内可见度（`orgPermission`）以及组织角色体系另见 `concepts/org-permissions.md`。两者一起决定一个资源完整的 visibility。

## Public Permission Levels

业务上公开度只用两档：

| Level | 何时使用 |
|-------|----------|
| `PRIVATE` | 仅所有者可见。新建资源的默认值。 |
| `PUBLIC_READ` | 平台上任何人可读取（浏览 / 查看详情）。**公开操作只用这一档。** |

`PublicPermissionLevel` 在 schema 里还有第三个值 `PUBLIC_READ_AND_DOWNLOAD`，**业务上通常不使用** —— 公开往往不希望对方批量下载。除非用户明确说"要开放下载"，否则不要主动设置这一档；要设置也得先跟用户确认是真的要让任何人都能拿走数据。

> **注意**：`PUBLIC_READ_AND_DOWNLOAD` 仅对 **User-owned**（个人）资源有效。Org-owned（组织）资源在服务端会被直接拒绝（`Permissions.getEntityPermissions` 的 Org 分支没有这一档处理，命中即 `IllegalArgumentException`）。组织资源最高对外公开档就是 `PUBLIC_READ`，要让组织成员能下载用 `orgPermission = ORG_READ_AND_DOWNLOAD`，详见 `concepts/org-permissions.md`。

## Permission Level vs Public Listing

Setting a public permission level does **not** automatically expose the resource on the public homepage / public listing pages. Listing exposure is controlled by tags (the reserved `public` tag in `tagNames`).

This split is intentional:

- A user can publish a resource for direct-link sharing without making it discoverable.
- Public listing requires both the right permission level **and** the right tag.

Don't conflate the two when reporting back to the user. If they ask "为什么我把数据集设成 PUBLIC_READ 了主页还看不到" the answer is the tag, not the permission level.

## Mutations

| Resource | Mutation | Input | Workflow |
|----------|----------|-------|----------|
| Dataset | `updateDatasetPermissions` | `DatasetPermissionInput { publicPermission, orgPermission }` | `workflows/dataset/update-dataset-permissions.md` |
| Project | `updateProjectEntityPermissions` | `UpdateProjectEntityPermission { publicPermission, orgPermission }` | `workflows/compute/update-project-permissions.md` |

Both inputs also accept `orgPermission`. 仅对 **Org-owned 资源**有意义；User-owned 资源服务端会忽略此字段。详见 `concepts/org-permissions.md`，包括组织资源必须满足的 coupling 约束（PUBLIC_READ + ORG_PRIVATE 不允许，服务端硬拒绝）。

## Read-Back

After any permission change, read back via:

- Dataset: `dataset/dataset-read-detail.graphql`
- Project: `compute/load-project-context.graphql`

两份模板都选了 `canUpdatePermissions` / `canUpdatePermission`、`creator { id username }`、`permissions { publicPermission, orgPermission, canPublicRead, canRead, canWrite }`，足够支撑 mutation 前的预检。

## Pre-Check Capability Flag

Before mutating, read 实体顶层的 `canUpdatePermissions`（dataset）/ `canUpdatePermission`（project）—— 服务端已综合 owner / creator / org-OWNER / super-admin 给出最终权限判定。如果 `false`，按 `concepts/org-permissions.md` 的"谁能改可见度"规则向用户解释原因（个人资源不是 caller；或组织资源 caller 既非 creator 也非 org OWNER），不要直接尝试 mutation。
