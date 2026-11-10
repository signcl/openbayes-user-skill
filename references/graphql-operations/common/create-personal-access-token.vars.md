---
tier: approval
title: 签发个人访问令牌
effect: 生成一个等同账号密码的长期访问令牌，泄露即全账号失守
subject: name
highlight: [expiresAt]
---

# create-personal-access-token.vars.md

`createPersonalAccessToken(userId, name, expiresAt)` 为外部 API 调用方签发长期可吊销的 PAT。**不是 skill 登录入口**：skill 登录只用 `--login` 的浏览器授权，不接受导入 token。

## 只能给自己签

`userId` 必须等于调用者本人，管理员也不能替别人签。管理员对他人调用返回 `没有权限`，不创建记录。源码依据 `AuthorizationService.canCreatePersonalAccessToken` 的 owner/current 同 id 判定，无 super-admin 旁路。

| 操作 | 本人 | 管理员对他人 |
|---|---|---|
| createPersonalAccessToken | 可以 | 不可以 |
| personalAccessTokens 列表 | 可以 | 可以，含已吊销 |
| revokePersonalAccessToken | 可以 | 可以 |

要给新账号配外部凭据，先让用户以该账号完成浏览器授权，使用其独立 profile 的 session；见 `openbayes-admin-biz/references/workflows/user/create-user.md`。

## vars.json

```json
{
  "userId": "<from-bootstrap me.username>",
  "name": "ci-runner"
}
```

## vars.explicit-expiry.json

```json
{
  "userId": "<from-bootstrap me.username>",
  "name": "ci-runner",
  "expiresAt": "2027-08-15T00:00:00Z"
}
```

| 变量 | 类型 | 必填 | 默认与约束 |
|---|---|---|---|
| userId | String! | 是 | 必须是本人 |
| name | String! | 是 | 非空白，≤30 字符，仅作标签 |
| expiresAt | UTCDateTime | 否 | 签发起 90 天，必须是未来时刻 |

## 明文只返回一次，安全交付外部调用方

列表永不返回 token 值，丢失只能吊销重签。返回物是 HS512 JWT，jti 等于 personalAccessToken.id。创建前确认用途、名称和有效期，执行带审批目标与 `--save-to`，不要打印明文：

```bash
bash <skill-dir>/scripts/run_graphql.sh \
  --vendor <profile> \
  --query-file <ops>/common/create-personal-access-token.graphql \
  --vars-file /abs/path/vars.json \
  --confirm-mutation-target '<vendor>:<endpoint>' \
  --save-to /abs/path/pat.json
```

响应没有数组，descriptor 不含 preview，不会回显 token。输出文件视为凭据，不 Read/cat；交给用户指定的外部 API 调用方安全接管，不写入 skill `.env` 或 session。交付失败保留唯一副本并报告，不盲目重签；只有确认已交付后才删除不再需要的副本。用 PAT 列表核对签发记录，不宣称已验证外部调用方可用。

## PAT 与账密登录会话的区别

两者都是 JWT，但生命周期不同（`api/security/TokenFilter.java` 的 PAT 托管分支）：

| | login 返回的会话 token | PAT |
|---|---|---|
| 改密码后 | 失效 | 仍有效 |
| 服务端登出后 | 失效 | 仍有效 |
| 失效条件 | 过期、改密、登出 | 吊销、过期、记录被删 |
| 有效期 | 服务端会话配置 | 默认 90 天，可指定 |

skill 的 `--login` 最终也签发 PAT；本地 `--logout` 只删 session，不吊销它。服务端最近使用时间按 5 分钟节流更新，不能据旧 lastUsedAt 断言未使用。

## 失败对照

| 服务端消息 | 含义 |
|---|---|
| 没有权限 | userId 不是本人或未认证 |
| name 长度校验失败 | 空白或超过 30 字符 |
| expiresAt 校验失败 | 不是未来时刻 |
| 资源不存在 | userId 不存在；组织不是用户，不能持有 PAT |
