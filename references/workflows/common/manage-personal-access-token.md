# Manage Personal Access Token (PAT)

用户要一个长期可用的 API 凭据时走这个 workflow：签发、查看、吊销。

典型说法：「给我个 token」「生成一个 API token」「我要个不会过期的凭据」「CI 里怎么调
OpenBayes」「把我的 token 吊销掉」「我那个 token 是多少」。

## 先分清是哪一件事

| 用户想要 | 走哪 |
|---|---|
| 新签一个长期凭据 | 本文「签发」 |
| 看看我有哪些 token / 还在不在用 | 本文「查看」 |
| 作废一个 token | 本文「吊销」 |
| **"我现在这个 token 是什么值"** | **取不到**——见下「拿不回明文」 |
| 登录 skill | `references/workflows/common/bootstrap.md`（只走浏览器授权，不接收已有 token） |

## 拿不回明文

明文只在签发那一次返回。`personalAccessTokens` 没有 token 字段，`.env.*` **不许打开**
（`references/runtime-setup.md`「凭据安全」）。问"我的 token 是多少"时正确回答是：

> 取不到——PAT 明文只在创建时显示一次。可以确认它**是否有效**（跑一次 whoami probe），
> 或者吊销后重签一个。

## 签发

1. Bootstrap 拿到 `me.username`。
2. **`userId` 必须填自己**——管理员也不能给别人签，服务端返回 `没有权限`。细节与整条
   代签链路见 `references/graphql-operations/common/create-personal-access-token.vars.md`。
3. 问清两件事，别替用户默认：
   - **`name`**：≤ 30 字符的标签，用途要能认出来（`cli` / `ci-runner` / `harness-beta`）
     ——以后吊销时靠它辨认。
   - **`expiresAt`**：不传 = **90 天**。自动化就显式传更长的（如一年）；90 天后悄悄失效
     比签短了更难排查。
4. 复述「将为账号 X 签发名为 Y 的 PAT，有效期至 Z」，得到确认再执行。
5. 执行 `common/create-personal-access-token.graphql`，**带 `--save-to`**，让 token 落文件
   而非回显 stdout。
6. 把落盘文件交给用户指定的外部 API 调用方安全接管；不要将它写入 skill session 或历史 `.env`。本客户端不支持导入 PAT 登录。
7. 读回 PAT 列表核对 name、expiresAt、所属账号；这只验证签发记录，不宣称已验证外部调用方可用。
8. 汇报：账号、`name`、`expiresAt`、凭据交付文件及未验证的外部接入。**绝不复述 token 值。**

## 查看

执行 `common/load-personal-access-tokens.graphql`。三个坑（详见
`load-personal-access-tokens.vars.md`）：

- **空数组不等于"没有 token"**——全被吊销、或无权限，都是静默 `[]`。先确认调用者身份。
- **在列表里不代表能用**——非管理员视角只滤掉"已吊销"，**过期的仍在**。拿 `expiresAt` 比。
- **查别人时 `userId` 填目标账号**，不是 `me.username`——填错会安静返回自己的列表。

`lastUsedAt` 按 5 分钟节流写库，刚用过也可能显示旧值。

## 吊销

1. 先列出来，用 **username + `name`** 摆给用户确认是哪一条（`id` 读不出是谁的、干什么用
   的）。要确认当前 profile 的 session 对应哪条 PAT，跑 `--identity --vendor <name>` 读 `jti`，别靠 `lastUsedAt` 猜。
2. 提醒后果：**立即生效、不可撤销**，所有还在用它的调用方当场断掉。
3. 确认后执行 `common/revoke-personal-access-token.graphql`。
4. 读回列表验证，**判据随调用者身份不同**：非管理员看那条记录**消失**，管理员看它
   **仍在但 `revokedAt` 非空**（分支只看有没有 admin 角色，与是不是本人无关）。统一按
   "必须消失"判，会把管理员一次**已成功**的吊销读成失败，进而重试一个不可撤销的操作。

## Guardrails

- 签发和吊销都是 mutation，一律带 `--confirm-mutation-target`。
- **任何情况下不把 token 值写进回复、日志或总结**；落盘的响应文件视同凭据，用完即删，
  不 `cat`。
- 用户要登录 skill 时走 bootstrap 浏览器授权；不要索要或导入现有 token。外部自动化的 PAT 管理与 skill 登录分开。
- 自动化场景用 PAT 而非 `login` 的会话 token：改密码、登出都不会让 PAT 失效（对照表见
  `create-personal-access-token.vars.md`）。

## GraphQL Operations

- `references/graphql-operations/common/create-personal-access-token.graphql`
- `references/graphql-operations/common/load-personal-access-tokens.graphql`
- `references/graphql-operations/common/revoke-personal-access-token.graphql`
