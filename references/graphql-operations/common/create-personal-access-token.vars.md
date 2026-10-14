---
tier: approval
title: 签发个人访问令牌
effect: 生成一个等同账号密码的长期访问令牌，泄露即全账号失守
subject: name
highlight: [expiresAt]
---

# create-personal-access-token.vars.md

`createPersonalAccessToken(userId, name, expiresAt)` 签发一个个人访问令牌（PAT）——
一个长期、可吊销的 API 凭据，用来填进 `.env.<profile>` 的 `OPENBAYES_TOKEN`。

## ⚠️ 只能给**自己**签，管理员也不例外

`userId` 看着像"给谁签"，但服务端要求它 **等于调用者本人**。这是 PAT 三个权限检查里
唯一**没有** admin 旁路的一个（读列表、吊销都有）：

| 操作 | 本人 | 管理员对他人 |
|---|---|---|
| `createPersonalAccessToken` | ✅ | ❌ **`没有权限`** |
| `personalAccessTokens`（列表） | ✅ | ✅（还能看到已吊销的） |
| `revokePersonalAccessToken` | ✅ | ✅ |

管理员替他人调用返回 GraphQL 错误 `没有权限`，未创建任何记录。源码依据
`AuthorizationService.canCreatePersonalAccessToken`（要求 owner 与 current 同 id，
无 super-admin 分支）。

**所以"管理员帮某个账号配 token"这条路不存在**：必须先以那个账号的身份 `login` 拿会话
token，再用它调本 mutation。整条链路见
`openbayes-admin-biz/references/workflows/user/create-user.md`。

## vars.json

```json
{
  "userId": "<from-bootstrap me.username>",
  "name": "cli"
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

## 变量

| 变量 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| `userId` | `String!` | 是 | — | **必须是调用者本人**（见上） |
| `name` | `String!` | 是 | — | 非空白，**≤ 30 字符**；仅作标签，不参与鉴权 |
| `expiresAt` | `UTCDateTime` | 否 | **签发起 90 天** | 必须是未来时刻；过去时刻报错 |

不传 `expiresAt` 时服务端给的是签发时刻起整 90 天。长期用（CI、harness）就显式传。

## `token` 只返回这一次

响应里的 `token` 是唯一一次拿到明文的机会——`personalAccessTokens` 查询**永远不返回
token 值**，只返回元数据。丢了只能吊销重签。

它是一个 HS512 JWT（长度随 claim 变化，约 295–306 字符），可直接作为 `OPENBAYES_TOKEN`
使用。它的 `jti` 等于响应里的 `personalAccessToken.id`。

### 落盘：用 `--save-to` + `jq` 管道，不要打印

**别让 token 出现在 stdout。** `--save-to` 把完整响应写进文件，stdout 只回一段
descriptor；本 mutation 的响应里没有数组，所以 descriptor **不含 `preview` 块**，
token 不会被回显（descriptor 仅有 `saved_to` / `operation` / `size_bytes` / `shape`）。

```bash
bash <skill-dir>/scripts/run_graphql.sh \
  --env-file <caller-env-file> \
  --query-file <ops>/common/create-personal-access-token.graphql \
  --vars-file /abs/path/vars.json \
  --confirm-mutation-target "<vendor>:<endpoint>" \
  --save-to /abs/path/pat.json

# token 直接管进 env 文件，全程不回显（写方向的重定向是凭据禁令的既有例外）
umask 077                                    # 兜底：这段里新建的文件都不给同组/其他人
target=~/.config/openbayes-skills/.env.<profile>
tmp=$(mktemp "$target.XXXXXX")               # mktemp 必然以 600 创建

if { echo "OPENBAYES_GRAPHQL_ENDPOINT=<endpoint>"
     jq -er '.createPersonalAccessToken.token
             | select(type == "string" and length > 0)
             | "OPENBAYES_TOKEN=" + .' /abs/path/pat.json
   } > "$tmp" && mv "$tmp" "$target"; then
  # 只有换上去了才清掉明文副本。`|| echo` 不可省：清理失败不能改变"写入成功"这个结论
  rm -f /abs/path/pat.json || echo "警告：pat.json 没删掉，它是明文 PAT，请手动删除"
else
  rm -f "$tmp"
  echo "写入失败；pat.json 已保留，修好后重跑本段"
fi
```

**必须 fail-closed，别简化成 `{ … } > 目标文件` 再 `rm`。** token 只返回一次，任何一环
失败都不能把它删掉：

- **临时文件 + `mv`**：直接 `> "$target"` 会在 jq 之前截断目标，jq 再失败就只剩半截 env
  文件，而原来那份可能是唯一能用的凭据。同目录 `mv` 是原子的。
- **`jq -er` + `select`**：不加时 `"OPENBAYES_TOKEN=" + null` 会安静产出
  `OPENBAYES_TOKEN=`，写出一个语法正确但没有 token 的文件。
- **`if` 而非 `A && B || C`**：判据只能是"写没写成"（jq + `mv`），`rm pat.json` 必须在
  判据**外面**。写成 `&&` 链时 `rm` 自己失败（目录只读、文件已不在）也会触发 `||`——
  `mv` 明明成功、目标已是新 token，却报「写入失败」，照提示重跑就白签第二个 PAT。
- **末尾的 `|| echo` 也是判据的一部分**，别当客套话删掉。`rm -f` 只吞"文件不存在"，
  **不吞权限拒绝**（目录不可写时返回 1）。**删掉 `|| echo` 之后**它就是 `then` 的最后一条
  命令，整个 `if` 于是退出 1——带 `set -e` 的脚本会在**写入已成功之后**中止，同样把人引向
  重签。加上它，这个退出码被吃掉，只剩一句警告。
- **`mktemp` 而非事后 `chmod`**：`chmod` 在创建之后，中间一瞬按 umask 可能是 644。

验证走 whoami probe（`--env-file` 指向新文件），**不要打开文件确认**——判定标准见
`references/runtime-setup.md`「凭据安全」。成功后记得删掉 `pat.json`。

## PAT 与登录会话 token 的区别

两者都是 JWT、都填 `OPENBAYES_TOKEN`，但生命周期不同（源码
`api/security/TokenFilter.java` 的 PAT 托管分支，注释写明是刻意为之）：

| | 登录会话 token（`login` 返回） | PAT |
|---|---|---|
| 改密码后 | **失效** | **仍有效** |
| 登出后 | **失效** | **仍有效** |
| 失效条件 | 过期 / 改密 / 登出 | 仅吊销、过期、记录被删 |
| 有效期 | 服务端会话配置 | 默认 90 天，可指定 |

所以自动化（测试 harness、CI、长期脚本）应当用 PAT：轮换账号密码不会把它踢掉。

服务端还会节流更新最近使用时间（间隔 5 分钟内不重复写库），可用来判断某个 PAT 还在
不在被使用。

## 失败对照

| 服务端消息 | 含义 |
|---|---|
| `没有权限` | `userId` 不是调用者本人（见顶部），或未认证 |
| name 长度校验失败 | `name` 为空白或超过 30 字符 |
| expiresAt 校验失败 | `expiresAt` 不是未来时刻 |
| 资源不存在 | `userId` 查无此人；注意组织（org）也会落进这一档，PAT 只属于用户 |
