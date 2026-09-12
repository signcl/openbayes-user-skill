# Inspect Org

Use this workflow when the user wants to look at one specific org in detail — typical phrasings: "看下这个组织", "<org> 的详情", "这个 org 还有多少席位", "我在 <org> 里能做什么".

For listing all orgs the user belongs to, use `list-my-orgs.md` instead.

## Goal

Load a single org's profile + capability flags + 席位余量, so the user can understand what's available in that org and what they (the caller) are authorized to do there.

## Scope

- Read-only.
- Caller must have a relationship with the org (member or pending) for the query to succeed under normal user token scope.

## Prechecks

1. Bootstrap is recommended so the assistant knows `me.username` and the caller's role within the target org (from `me.orgs[]`).
2. If the user gave the org by displayName instead of a confirmed `id`, first run `list-my-orgs.md` (`references/graphql-operations/org/list-my-orgs.graphql`) to resolve the id. Do not stop at `whoami.graphql` alone for an org-detail request; `whoami` is bootstrap context, while `list-my-orgs` / `load-org-detail` is the user-scope org read path.

## Deterministic Steps

1. Normalize the request into `org.inspect`.
2. Call `references/graphql-operations/org/load-org-detail.graphql` with `$orgId` (the org's `id`).
3. Present:
   - `displayName` + `id` + `description` + `imageUrl`
   - `seatCountQuota`：`usedSeatCount / seatCount`，剩余 `freeSeatCount`（用户问"还能加几个人"时直接看这里）
   - Capability flags：`canAccessOrgManagement` / `canCreateInvitation` / `canCreateProject` / `canCreateDataset` / `canCreateAutoML` / `canUpdatePermissions` / `canUpdateDisplayName`
4. 若用户随后问"我在这个 org 里是什么角色"，从 `me.orgs[]` 里取那条记录返回（不必再调 detail）。

## Guardrails

- Capability flags 的 false 值通常意味着 caller 在该 org 里不是 OWNER 或权限被组织策略限制；按 `concepts/org-management.md` 的 authorization 矩阵向用户解释，而非笼统说"没权限"。
- 若返回 `null`（即该 org 不可见），caller 大概不是该 org 的成员；提示用户检查 org id 是否正确。

## GraphQL Operations

- `references/graphql-operations/org/load-org-detail.graphql`

## Concept References

- `references/concepts/org-management.md`
- `references/concepts/org-permissions.md`
