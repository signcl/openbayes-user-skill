# List Org Members

Use this workflow when the user wants to see who's in an org — typical phrasings: "列一下 <org> 的成员", "<org> 里都有谁", "show me members of <org>", "组织成员列表".

## Goal

Return a paged list of members for a given org, including each member's role and the caller-relative `canRemove` / `canChangeRole` flags.

## Scope

- Read-only.
- Caller must be a member of the target org (or platform super-admin) for the query to return data.
- Returns all member states — `OWNER`, `MEMBER`, `PENDING`. Do not filter PENDING out client-side; user often wants to see "who's been invited but hasn't joined yet".

## Prechecks

1. Bootstrap recommended.
2. If the user gave the org by displayName, resolve the id via `list-my-orgs.md` first.

## Pagination

`orgMembers` 是 page-based:

- `page` 从 1 开始。
- `perPage` schema 默认 30；模板默认 30；按需调整。
- `pageInfo.total` 是当前筛选条件下的成员总个数；总页数按 `Math.ceil(total / perPage)` 计算，本页条数读取 `data.length`。
- 按 `pageInfo.next > 0` 返回的页码继续请求，`next == 0` 时停止。通用字段含义与计数规则见 `references/graphql-discipline.md` →「分页字段与计数」。

## Deterministic Steps

1. Normalize the request into `org.members.list`.
2. Call `references/graphql-operations/org/load-org-members.graphql` with `$orgId`、`$page = 1`、`$perPage = 30`.
3. For each member entry, summarize:
   - `user.username` + `user.displayName`
   - `role`（OWNER / MEMBER / PENDING）—— PENDING 显式标注"邀请未接受"
   - `email`（PENDING 邀请用 email 时这里会有值）
   - `createdAt`（成为成员 / 被邀请的时间）
   - `expiredAt`（PENDING 邀请有过期时间）
   - 若 caller 是 OWNER：附带 `canRemove` / `canChangeRole` 标记，让用户知道哪些成员"理论上能被你管"
4. 若用户问"我能不能改 X 的角色"或"我能不能踢 X"，按 `concepts/org-management.md` 的 authorization 矩阵回答，并指出本 skill 不直接发 mutation——请到 console 操作。

## Guardrails

- 不要把 OWNER 数和 OWNER 角色混淆：要回答"还能不能再加 OWNER"看 `org.seatCountQuota.freeSeatCount`（来自 `inspect-org.md`），而不是当前 OWNER 数。
- 不要按 `role` 推断 capability—— 直接读 `canRemove` / `canChangeRole` 字段。
- 不发任何 mutation：v1 范围内 skill 不提供成员管理写入；统一指向 console。

## GraphQL Operations

- `references/graphql-operations/org/load-org-members.graphql`

## Concept References

- `references/concepts/org-management.md` —— role / authorization / capability flags
