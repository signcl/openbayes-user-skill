# Update Project Permissions

Use this workflow when the user wants to change a project's public permission level or its organization-internal visibility.

## Goal

Update a project's `publicPermission` and/or `orgPermission` and verify the change.

## Scope

This workflow covers both `publicPermission`（公开可见度）和 `orgPermission`（组织内可见度）。

参考概念文档：

- `concepts/resource-visibility.md` — 公开度的两档业务取值
- `concepts/org-permissions.md` — 组织角色体系、`orgPermission` 的业务三档、coupling 规则

## Intent to Query Mapping

- `project.update.permissions` -> `UpdateProjectEntityPermissionsMutation` (`compute/project-update-permissions.graphql`)

## Deterministic Steps

1. Normalize the request into `project.update.permissions`.
2. Load `compute/load-project-context.graphql`. 从返回中读出三件事：
   - **owner 类型**：`owner.__typename` 是 `User` 还是 `Org`（决定后续 orgPermission 是否要传）
   - **当前 `publicPermission` 和 `orgPermission`**
   - **`canUpdatePermission`**：false 直接停下并按 `concepts/org-permissions.md` 的规则向用户解释（最常见两种：①个人项目不是 caller；②组织项目 caller 既非 creator 也非 org OWNER）。需要 creator 信息时模板返回的 `creator.username` 派上用场
3. 跟用户确认目标可见度：
   - `publicPermission`: `PRIVATE` 或 `PUBLIC_READ`。`PUBLIC_READ_AND_DOWNLOAD` 业务上通常不用，且 **owner 是 Org 时服务端直接拒绝**（详见 `concepts/resource-visibility.md`）—— 只有当 owner 是 User 且用户明确说"开放下载"时才考虑，且执行前再次确认
   - `orgPermission`：**仅当 owner 是 Org 时**才设置。可选 `ORG_PRIVATE` / `ORG_READ_AND_DOWNLOAD` / `ORG_WRITE`（`ORG_READ` 不使用）。owner 是 User 的个人项目不要传此字段，传了也无效（服务端忽略）
4. **若 owner 是 Org，应用 coupling rule**：`publicPermission = PUBLIC_READ` 时 `orgPermission` 不能是 `ORG_PRIVATE`，否则服务端抛 `IllegalArgumentException`：
   - 用户要把组织 project 公开（`PUBLIC_READ`）但当前 `orgPermission = ORG_PRIVATE`：把 `orgPermission` 同步升级到 `ORG_READ_AND_DOWNLOAD`（默认）或 `ORG_WRITE`（按用户意图）
   - 用户要把 `orgPermission` 收紧到 `ORG_PRIVATE` 但当前 `publicPermission = PUBLIC_READ`：先降到 `PRIVATE`，或向用户解释冲突，确认后二选一
5. Restate target project id/name；组织资源列出**两个字段**的当前值和目标值（即使用户只改一个，也要确认另一个不受影响）；个人资源只列 `publicPermission`。
6. Ask for confirmation.
7. Execute `compute/project-update-permissions.graphql`.
8. Read back via `compute/load-project-context.graphql` to confirm the change.

## Public Listing Semantics

Permission level and homepage listing are different layers:

- `publicPermission=PUBLIC_READ` controls who can read the resource via direct link.
- Homepage / public listing exposure is tag-driven (reserved `public` tag in `tagNames`).

If the user asks "为什么改成 PUBLIC_READ 后主页还看不到"，answer with the tag, not the permission level. See `concepts/resource-visibility.md`.

For explicit listing Tag Assignment, apply `references/concepts/resource-tags.md` through `workflows/compute/update-project-tags.md`; this permission mutation is one step in that sequence.

## Guardrails

- Always confirm before mutation.
- Always read-back after write.
- Clearly distinguish permission-level changes from public-listing exposure.

## GraphQL Operations

- `references/graphql-operations/compute/project-update-permissions.graphql`
- `references/graphql-operations/compute/load-project-context.graphql`
