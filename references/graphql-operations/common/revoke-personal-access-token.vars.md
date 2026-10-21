---
tier: confirm
title: 吊销个人访问令牌
effect: 该 PAT 立即失效，用它登录的会话与脚本全部断开，且无法恢复
subject: userId
highlight: [id]
---

# revoke-personal-access-token.vars.md

`revokePersonalAccessToken(userId, id)` 立即作废一个 PAT。返回 `DeletionStatus`。

## vars.json

```json
{
  "userId": "<owner-username>",
  "id": "<from load-personal-access-tokens>"
}
```

`id` 是 `personalAccessTokens` 列表里那个短 id（形如 `7Kq2mXvNbR4`），**不是** token 本身。

## 谁能吊销

本人可以吊销自己的；**管理员可以吊销任何人的**（与签发不同——签发没有 admin 旁路，
见 `create-personal-access-token.vars.md`）。这一不对称是刻意的：管理员能收回一个泄露
的凭据，但不能替别人造一个。

## 是软删除，且不可撤销

吊销把记录的 `revokedAt` 置为当前时间，记录本身留着：

- 本人此后在 `personalAccessTokens` 里**看不到**它了（本人视角只返回未吊销的）。
- 管理员仍能看到，`revokedAt` 非空。
- **没有"取消吊销"的操作**，要恢复只能重新签一个（新 token 值，旧的永久作废）。

服务端在每次请求时查注册表，吊销**立即生效**——不用等 JWT 过期。

## 执行前必须确认

吊销会当场打断所有还在用这个 token 的调用方（CI、测试 harness、别人机器上的
`.env.*`），且不可撤销。

**"某个 `.env.*` 用的是哪一条"离线可确定，别靠 `lastUsedAt` 猜**——token 的 `jti` claim
就是这里要传的 `id`：

```bash
bash <skill-dir>/scripts/run_graphql.sh --env-file <该文件> --identity   # 读 sub 与 jti
```

把读出的 `jti` 跟列表里的 `id` 一比就锁定是哪条。

**向用户复述用 `sub`（= username = `userId`）+ `name`**，别甩那串短 id——它读不出是谁
的、干什么用的，对方无从判断该不该吊销。短 id 只在发起调用时作为参数出现。

## 失败对照

| 服务端消息 | 含义 |
|---|---|
| `没有权限` | 既不是本人也不是管理员 |
| 资源不存在 | `id` 查无此记录，或 `userId` 查无此人 |
