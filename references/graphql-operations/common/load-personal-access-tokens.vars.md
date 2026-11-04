# load-personal-access-tokens.vars.md

`personalAccessTokens(userId)` 列出某个账号的 PAT **元数据**。

## vars.json（查自己）

```json
{
  "userId": "<from-bootstrap me.username>"
}
```

管理员查别人时把 `userId` 换成目标账号的 username。**它是"看谁的列表"，不是"我是谁"**
——查自己时恰好等于 `me.username`，照抄到查他人的场景就会安静地查回自己的列表。

## ⚠️ 无权限时返回空数组，不报错

查别人的 PAT 而你不是管理员时，服务端返回 `{"personalAccessTokens": []}` —— HTTP 200、
无 `errors`、`total` 概念都没有。**空列表有三种可能**：这个账号确实没有 PAT、有但
**全被吊销了**（非管理员视角看不到已吊销的）、你没资格看——从响应上分不出来。

| 调用者 | `userId` | 结果 |
|---|---|---|
| 普通用户 | 自己 | `[]` = 没有**未吊销**的（也可能是全吊销了） |
| 普通用户 | 别人 | `[]` ← **权限不足，但静默** |
| 管理员 | 自己 | 全部，含已吊销的 |
| 管理员 | 别人 | 全部 |

所以：**先用 whoami 确认自己是谁、有没有 admin，再解释空结果**。别把 `[]` 直接翻译成
"该账号没有 token"。

## 列表内容随**调用者是不是 admin** 变化

同一个 `userId`，看到的行数不一样。分支只看**调用者有没有 admin 角色**，与是不是本人
无关（源码 `PersonalAccessTokenDataFetcher`：admin 走 `findAllByOwnerId`，其余走
`findActiveByOwnerId`）：

- **普通用户查自己** → 只返回**未吊销**的。
- **管理员** → 返回全部，含已吊销的（`revokedAt` 非空）——**查自己也一样**，所以一个
  admin 账号看自己的列表会比普通用户多出历史记录，别误以为那些还能用。

注意"active"只表示 **未吊销**，**不含**"未过期"——过期的 PAT 仍在本人列表里，只是调用会
被拒。能不能用要自己比对 `expiresAt`，别看它在不在列表里。

## 永远拿不到 token 值

响应里没有 `token` 字段，`PersonalAccessToken` 类型上也不存在——明文只在
`createPersonalAccessToken` 的响应里出现一次。用户问"我那个 token 是多少"时，正确回答
是"取不到了，可以吊销后重签"，而不是去翻 `.env.*` 文件（见
`references/runtime-setup.md`「凭据安全」）。

## 字段读法

| 字段 | 读法 |
|---|---|
| `id` | 吊销时传给 `revokePersonalAccessToken` 的 id；**等于 token 的 `jti`**，可用 `--identity` 离线比对 |
| `name` | 创建时的标签，仅供人辨认。**复述用 `ownerId`（= username）+ `name`**，别甩那串短 id |
| `expiresAt` | 与当前时间比，判断是否已过期 |
| `lastUsedAt` | 最近一次用它认证的时间；**服务端节流 5 分钟**，刚用过也可能没刷新。`null` = 从未使用 |
| `revokedAt` | 非空 = 已吊销。**非管理员视角看不到这类记录**（与是不是本人无关，见上节）；管理员视角看得到，包括看自己的 |
