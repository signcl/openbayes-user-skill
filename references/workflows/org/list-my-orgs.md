# List My Orgs

Use this workflow when the user wants to see which organizations they belong to — typical phrasings: "我有哪些 org", "我的组织", "what orgs am I in", "我在哪些组织里".

## Goal

Return all orgs the current user belongs to, with role and capability flags so the user knows what they can do in each org.

## Scope

- Read-only.
- Includes orgs in PENDING state (邀请未接受) so user knows what invitations are outstanding. Console UI hides PENDING from the org switcher; this skill surfaces them deliberately.
- Does not list orgs the user has no relation to (the schema only exposes `me.orgs`, which is the caller's membership set).

## Prechecks

1. Run bootstrap if not already done (see `references/workflows/common/bootstrap.md`). Bootstrap already loads `me.orgs` at low fidelity; this workflow re-fetches with richer fields when the user explicitly asks for the org list.

## Deterministic Steps

1. Normalize the request into `org.list.mine`.
2. Call `references/graphql-operations/org/list-my-orgs.graphql`. No variables required.
3. For each member entry in `me.orgs`, present:
   - `org.displayName` + `org.id`
   - `role`（OWNER / MEMBER / PENDING）—— 解释含义参考 `references/concepts/org-management.md`
   - 关键 capability flags（按需展示，PENDING 的几乎都是 false）：
     - `org.canAccessOrgManagement`
     - `org.canCreateInvitation`
     - `org.canCreateProject` / `canCreateDataset`
     - `member.canChangeRole` / `member.canRemove`（针对 caller 自己这条记录）
   - `expiredAt`（若有，表示该成员关系会过期）
4. PENDING 成员单独提示一句："这是一个等待你接受的邀请，请到 console 处理"，并指向相应 console 路径（不要尝试 mutation）。

## Guardrails

- 不要把 `me.roles`（平台级 `PartyRole`）和 `me.orgs[].role`（org 内 `UserRole`）混淆——它们是不同的 enum。
- 当 `role == "PENDING"` 时，`canChangeRole` / `canRemove` 通常是 false 或 null；不要据此推断"用户没有权限"——是因为还没正式入组。
- 不要尝试任何写操作：本 skill v1 不提供成员管理 mutation。

## GraphQL Operations

- `references/graphql-operations/org/list-my-orgs.graphql`

## Concept References

- `references/concepts/org-management.md` —— role 含义、生命周期、authorization 矩阵
- `references/concepts/org-permissions.md` —— 资源可见度（与 membership 不同层）
