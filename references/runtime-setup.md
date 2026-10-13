# 运行环境与执行契约

三个 OpenBayes skill 包共用的执行期约定：凭据安全、环境配置、执行命令、输出契约。各 SKILL.md 正文只保留硬性安全约束和入口指针；**首次执行 `run_graphql.sh` 前先读完本文件**。

> 文中 `references/workflows/common/bootstrap.md` 是 openbayes-user 包内文件；在 admin 包上下文里经由同机安装的 user 包读取（`openbayes-user/references/workflows/common/bootstrap.md`）。

## 凭据安全（硬性约束）

**禁止打开任何 `.env.*` 文件。** 判定标准只有一条：`.env.*` 的路径**只允许**作为 `run_graphql.sh` 的 `--env-file` 参数出现；它出现在任何其他会读内容的命令里（Read / cat / head / tail / less / sed / awk / grep / cut / strings / base64 / cp / source …）都算打开，`echo $OPENBAYES_TOKEN` 这类环境变量打印同理。**自带脱敏也不行**（如 `cat … | sed 's/=.*/=<redacted>/'`）：脱敏管道离泄漏只差一个正则写错，而且没有必要。**「先看一眼文件里有什么」这个动作本身就是违规，且从来不需要**：要确认凭据文件在不在，`ls -a ~/.config/openbayes-skills/`（只列文件名；`ls` 不带 `-a` 看不到点文件）就够；内容一律交给 `--env-file` 由脚本解析：文件找不到它报 `ENV_FILE_NOT_FOUND`（同名文件会先在别处回退一次，见下「`--env-file` 指的路径不存在时」），缺 token 或 endpoint 报 `MISSING_TOKEN` / `MISSING_ENDPOINT`；要确认 profile 配没配好就跑 probe 看 `--envelope` 的 `token_source`。用户在指令里给了 `.env.*` 的绝对路径也一样：那条路径只往 `--env-file` 里放，第一条命令就不许是 cat / head 它。两个例外：① bootstrap 代填——用户把 token 给你、由你写入文件（只写，不回读）；② 不含凭据的模板 `.env.example`（仓库内公开脚手架，本就没有 token 值可泄）——`cp .env.example .env.<vendor>` 这类**建**初始文件的用法不算打开凭据（见「环境配置」）。所有凭据由 `run_graphql.sh` 内部自动加载，LLM 不应接触任何 token 值。

LLM 在以下场景容易触发这条，**全部都是错的**：

- ❌ "我先 Read 一下 `.env.beta` 确认 token 配好了"
- ❌ 用户问"我的 token 是什么"——LLM 想去 `.env` 找
- ❌ token 调用失败——LLM 想 cat `.env` 排查
- ❌ `cat .env.beta | sed 's/=.*/=<redacted>/'`——脱敏不改变「打开了文件」这个事实
- ❌ `ls ~/.config/openbayes-skills/ && head -c 500 ~/.config/openbayes-skills/.env.beta`——存在性检查之后接读取，仍是打开

正确做法：

- ✅ **确认凭据文件在不在**：`ls -a ~/.config/openbayes-skills/`，只看文件名，到此为止
- ✅ **跑一次最小 GraphQL probe**（`run_graphql.sh ... --query-file references/graphql-operations/common/whoami.graphql --vars-json '{}'`）观察返回：
  - 200 + 有 `username` → token 正常
  - 401 / `GRAPHQL_EXECUTION_ERROR` 含 "认证失败"（如"登录已过期，请重新登录"） → token 过期或无效
  - 连不上 / DNS 失败 → endpoint / 网络 / VPN 问题
- ✅ **想知道某份凭据是哪个账号的**，跑 `run_graphql.sh --env-file <path> --identity`：它由脚本内部读取 token（和发请求时同一条路径）、只输出 `sub` 等 claim，**不打印 token、不联网**。这条不算"打开凭据文件"——你没碰文件，脚本碰的。**别为了回答这个问题去 `cat` / `grep` env 文件**，那才是违规。
- ✅ 只检查 env 是否设置（**不读值**）：`[ -n "$OPENBAYES_TOKEN" ] && echo set || echo not-set`
- ✅ 用户问"我的 token 是什么"——回答"出于安全不能显示 token 值；可以确认它**是否有效**——跑一次 probe 给你看"
- ✅ 用户问 `.env.*` token 是否过期时，把文件作为 `--env-file` 跑 probe；**不要 Read/cat/grep/sed 文件**。

**token 过期/被拒时不要立即放弃。** 同一个 profile（`--vendor` 的值，见下文「环境变量文件查找规则」）的 token 来源有三个：环境变量、当前目录 `.env.{profile}`、用户级 `~/.config/openbayes-skills/.env.{profile}`。先自动在这三个来源里换一个**同 profile** 的可用 token 重试。**失效的那个若来自环境变量，换文件是换不掉它的**（见下「环境变量覆盖」）——得用 `env -u OPENBAYES_TOKEN` 显式清掉再重试；`OPENBAYES_GRAPHQL_ENDPOINT` 不要顺手一起清，in-cluster 部署靠它注入。**但 profile 名一样不等于账号一样**——这三份 `.env.{profile}` 可以装着不同账号的 token（本仓测试里就真发生过：假 `.env.beta` 打不通后回退到了另一个真账号那份）。所以**换源后、继续原操作前必须过一道「同账号不变式」**：对新 token 跑一次 whoami，`username` 必须与本次会话已确立的操作身份一致（写 / admin 操作再加 role、endpoint 一致）；**一致才继续，变了就停**——把「原账号 X → 回退后是 Y」摆给用户让他定，绝不静默换个账号把操作打出去（悄悄读到别人的数据、或写到别人账号上，都由这条兜住）。核对通过后照旧在总结里告知哪个过期、最终用了哪个（路径 + whoami 身份）；只有同 profile 候选全失效时才引导用户去控制台拿新 token。

**绝不自动换用别的 profile 的 token。** `.env.beta` 过期了不要去拿 `.env.bj`——不同 profile 通常指向不同环境甚至不同账号体系，静默串用会把操作打到用户没预期的后端。换 profile 必须问过用户。完整流程（含自动切换步骤与新建剧本）见 `references/workflows/common/bootstrap.md` 的"Pre-auth 边界处理"节（场景 4 = 同 profile 换来源；场景 1 = 完全没 token / 需要跨 profile 才问用户）。

### 环境变量文件查找规则

**`--vendor` 的值是「凭据 profile 名」，不是一个只有两项的品牌枚举。** 它决定去找哪个 `.env.<name>`：`--vendor bj` → `.env.bj`。所以用户级目录里有 `.env.beta` / `.env.bj` 这类文件时，`--vendor beta` 是**正确**用法，不是笔误。

`openbayes` / `hyperai` 的特殊之处只有一点：它们额外自带默认 endpoint（见下文「填写 Token」），文件里可以不写 `OPENBAYES_GRAPHQL_ENDPOINT`。其余 profile 必须在自己的 `.env.<name>` 里写明 endpoint，否则报 `MISSING_ENDPOINT`。

**想确认某个 profile 配没配好，跑一次 probe 看回执，不要打开文件确认。** 回执已经把答案给全了：`--envelope` 的 `token_source` 说明实际用了哪个文件、`endpoint` 说明打到哪个网关；缺 endpoint 时脚本直接报 `MISSING_ENDPOINT` 并附上它找过的路径。文件里有没有那一行，probe 一次即知——**用不着看内容**。

用哪个 profile 由用户的说法决定；**不要为了确认而提前去翻凭据目录或全盘搜索 env 文件，更不要 `cat` 手边那个 `.env.*` 看看里面写了什么**——本节讲的全是文件*名*，文件*内容*在任何情况下都不读（见开头「凭据安全」）。真的对不上（跑出 `MISSING_TOKEN` / `MISSING_ENDPOINT`）时，再走 `references/workflows/common/bootstrap.md` 场景 1 的既有流程——它只列文件名、不读内容，并让用户显式选。

脚本先**选一个文件**加载，再让**环境变量覆盖**文件里的同名键。

先选文件（命中即止）：

1. 若指定了 `--env-file` **且该路径存在**，使用它
2. 当前工作目录下的 `.env.{vendor}`
3. 用户级配置目录 `~/.config/openbayes-skills/.env.{vendor}`

#### `--env-file` 指的路径不存在时，会按**文件名**去别处找

第 1 步不是"要么用这个路径、要么报错"。路径不存在时，只要**文件名**长得像 `.env*`，
运行时会拿这个 basename 再去 `~/.config/openbayes-skills/` 和当前目录各找一次，
找到就用（`graphql-core.mjs` 的 `resolveEnv` fallback 分支）。

三种写错方式（用 `--identity` 观察）：

| `--env-file` 写成 | 结果 |
|---|---|
| `/nonexistent/dir/.env.beta-probe`（目录错、文件名对） | **静默启用** `~/.config/…/.env.beta-probe`，`token_source: env-file-fallback:user-config` |
| `/nonexistent/dir/.env.no-such-profile`（文件名也不存在） | `ENV_FILE_NOT_FOUND`，fail closed |
| `/nonexistent/dir/creds.txt`（不像 `.env*`） | `ENV_FILE_NOT_FOUND`，fail closed |

**只有第一行有风险，但它正是打错路径时最常见的那种。** 平时它多半帮了忙（同名文件通常
就是你想要的那份），**在多账号场景里则可能换掉身份**：如果当前目录和用户配置目录各有
一份同名 `.env.beta`、而里面是**不同的账号**，一个目录级笔误就会安静地切到另一个人身上。

判据在回执里，不用打开文件：`token_source` 出现 **`env-file-fallback:`** 前缀就说明
用的不是你写的那个路径（正常命中是 `env-file:<你写的路径>`），`--envelope` 的
`warnings` 里也会有一条说明回退到了哪里。

然后，**shell 里已导出的 `OPENBAYES_TOKEN` / `OPENBAYES_GRAPHQL_ENDPOINT` 会覆盖上一步读到的值——`--env-file` 也盖不住它**（`graphql-core.mjs` 的 `resolveEnv` 在选完文件之后无条件写入 `processEnv` 的这几个键）。

**这一条与直觉相反，而且是静默的。** `OPENBAYES_TOKEN=bogus … --env-file ~/.config/openbayes-skills/.env.beta` 返回 `没有登录`，`--envelope` 里 `token_source` 是 `environment:OPENBAYES_TOKEN` ——那份 env 文件从头到尾没被用上。

所以：

- **只要 shell 里导出过 `OPENBAYES_TOKEN`，换 `--env-file` / `--vendor` 就换不动账号了**，每一次调用都打在同一个身份上。多账号场景里这会让"我在轮流用 8 个账号"变成"我用一个账号跑了 8 遍"，且全程无报错。
- 拿不准就看 `--envelope` 的 `token_source`：它是 `environment:OPENBAYES_TOKEN` 还是 `env-file:<path>`，一眼就知道这次到底用了谁。
- 要摆脱环境变量，用 `env -u OPENBAYES_TOKEN -u OPENBAYES_GRAPHQL_ENDPOINT bash …/run_graphql.sh …` 显式清掉，别指望 `--env-file` 压过它。**两个都要清**：`OPENBAYES_GRAPHQL_ENDPOINT` 走的是同一条无条件覆盖，只清 token 会换了账号却没换环境——拿 beta 的凭据打到导出的那个 endpoint 上，失败信息还只是一句"没有登录"。

推荐使用 `--env-file` 或当前工作目录。任何 packaged skill 目录都不是配置目录，例如同时包含 `SKILL.md` 和 `scripts/run_graphql.sh` 的目录。

### 多账号切换：每次换身份都要过 whoami，别信响应里的回显

同时操作多个账号时（测试 harness 造的一批账号、admin 与被测账号来回切），**拿错 token 不会报错，会给你一份格式完整的错答案**。

绝大多数 operation 同时带两个身份来源：**认证用的 token**，和显式传入的 `userId` / `username` 参数。两者不一致时服务端按 token 的权限裁剪数据，但**照常返回 200**，并且**把你传进去的 id 原样回显**——看起来就像查对了。

同一条 `party(id: "zhangsan")` 查询，只换 token：

| 用的 token | `roles` | `account.balance` | `jobs` 总数 |
|---|---|---|---|
| `zhangsan` 本人 | `["normal_user","admin"]` | 1234.56 CNY | 189 |
| 另一个普通账号 | `null` | **0 CNY** | **0** |

第二行没有任何错误信号：`party.id` 依然是 `"zhangsan"`。**零不是"查不到"，它读起来就是事实**——"这个用户余额 0、没有 job"。据此下的任何结论都是错的。

### `--identity`：不发请求就看出这次会用谁的身份

平台 token 是 JWT，`sub` 就是 userId——**本平台 `User.id` 恒等于 `username`**（`Org` 没有 username，只有 `id`），所有 `userId` / `ownerId` 参数填的都是 username，不存在另一个数字 id。`run_graphql.sh --identity` 走**与真实请求完全相同**的凭据解析，然后只解出 claim 打印出来——**不联网、不打印 token**：

```bash
bash <skill-dir>/scripts/run_graphql.sh --env-file ~/.config/openbayes-skills/.env.beta --identity --pretty
```

```json
{
  "endpoint": "https://beta.openbayes.com/gateway/graphql",
  "token_source": "env-file:/Users/…/.config/openbayes-skills/.env.beta",
  "sub": "zhangsan",
  "kind": "personal-access-token",
  "jti": "7Kq2mXvNbR4",
  "expires_at": "2027-01-01T00:00:00.000Z",
  "expired": false,
  "verified": false
}
```

它补的正是 `token_source`（用了哪个**文件**）和 whoami（服务端认你是**谁**）之间那段空白：**这份凭据属于哪个账号**，离线可得。`jti` 则是这条 PAT 记录的 `id`，吊销时传的就是它。上面那个环境变量覆盖的坑，一眼就现形——`--env-file` 指着 A，`token_source` 却是 `environment:OPENBAYES_TOKEN`、`sub` 是 B。

**`verified: false` 不是客套。** 它不验签（我们没有签名密钥），所以：

- **已吊销的 PAT 照样解得出来**，`expired: false` 也照给。吊销状态只在服务端的注册表里，本地看不见。
- 伪造的 token 同样会被老实解析并报出它自己写的 `sub`。
- JWT 里那个 `roles` claim 是签发当时的快照，**服务端不认它**——鉴权时会拿 `sub` 重新读一遍用户。所以 `--identity` 不输出 roles，要判权限只能看 whoami。

一句话：**`--identity` 抓的是你自己配错了，不是"这个 token 能用"**。批量切换时先用它扫一遍（快、免费、无副作用），真正动手前仍然要跑 whoami。

纪律：

1. **每换一次凭据，先跑 whoami**，把 `username`（写/admin 操作再加 `roles`、`endpoint`）与你**打算**操作的身份对一遍；对不上就停，不要继续。批量遍历时可以先用 `--identity` 快速筛一遍再逐个 whoami。这与上文「同账号不变式」是同一条规则，只是那里讲的是自动回退，这里讲的是主动切换——**主动切换更要守，因为没有任何失败信号提醒你**。
2. **不要用响应里的 `id` / `username` 回显来"验证"身份**。那是你传进去的参数，服务端原样送回，它只证明你没打错字。
3. 批量遍历账号时，把 whoami 的结果和该轮的目标账号一起记进结果里。事后发现数据不对，这是唯一能区分"账号真的是空的"和"当时用错了 token"的证据。
4. **`--confirm-mutation-target` 挡不住这个。** 它的值是 `<vendor>:<endpoint>`，不含身份——同一个环境下所有账号的闸门字符串**完全相同**。它防的是"打错环境"，不防"打错账号"。跨账号的写操作，身份核对只能靠上面第 1 条。

## 环境配置

首次使用前需要完成以下配置：

### 1. 创建环境文件

```bash
cp .env.example .env.openbayes
```

### 2. 填写 Token

打开 OpenBayes 控制台的 Personal Access Token 管理页 `https://openbayes.com/console/settings/account/personalAccessToken`（HyperAI 是 `https://app.hyper.ai/console/settings/account/personalAccessToken`，beta、next、私有部署换成对应站点的域名；admin 包的 token 必须来自具有管理员权限的账号），点「创建 Token」；这个地址打不开时手动走：右上角头像 →「账号设置」→「Personal Access Token」→「管理 Token」→「创建 Token」。然后填名称与过期时间；令牌只完整显示一次，复制后写进当前工作目录下的 `.env.openbayes`。页面上没有「认证 Token」这一项，别让用户去找。

**文件里可以只放 token 本身**：整份文件去掉首尾空白后是一行、且不含 `=`，就当作 `OPENBAYES_TOKEN`。`OPENBAYES_TOKEN=<token>` 的 KEY=VALUE 写法照样支持。两种写法不能混：文件里只要出现任何 `=`，就整份按 KEY=VALUE 解析，那行裸 token 会被忽略，结果是 `MISSING_TOKEN`。所以要加 endpoint 时，token 也得改写成 `OPENBAYES_TOKEN=` 那一行。上一步从 `.env.example` 复制来的文件本来就有 `OPENBAYES_TOKEN=` 等带 `=` 的行，这种文件要把 token 填在 `OPENBAYES_TOKEN=` 后面；想用裸 token 写法，就把文件内容整个换成 token 本身。

官方环境（`openbayes` / `hyperai`）只需填 token——`OPENBAYES_GRAPHQL_ENDPOINT` 留空即可，运行时按 vendor 自动补默认值（`openbayes` → `https://openbayes.com/gateway/graphql`，`hyperai` → `https://app.hyper.ai/gateway/graphql`）。只有连私有部署 / 集群内网 / 其他自定义环境时，才需要额外填 endpoint。

运行中遇到"登录已过期"/认证失败时，先按上文"token 过期/被拒时不要立即放弃"自动换来源重试，不要急着引导用户重新复制 Token。

### 3. 配置说明

如果不希望依赖当前工作目录，显式传入 `--env-file /abs/path/to/.env.openbayes`。也支持把通用配置放在 `~/.config/openbayes-skills/.env.openbayes`。运行时基于 Node.js，无需额外初始化步骤。

> 用户还没建好这个文件就发起需要凭据的请求时，不要只把上面的手动步骤甩给他——默认直接问他要 token、替他写好 `.env.{vendor}`（官方环境只需 token，endpoint 留空走默认值）再继续原任务；他想自己弄时再给步骤。完整流程见 `references/workflows/common/bootstrap.md` 场景 1。

## Execution Commands

**`<skill-dir>` = 本 skill 包根目录（`SKILL.md` 的同级），下文示例里替换成它的真实绝对路径。** 执行入口固定是 `<skill-dir>/scripts/run_graphql.sh`，与当前工作目录无关——cwd 通常是用户自己的项目，那里没有这个脚本。所以别 `find` 它、别 `cd` 到别处拼相对路径、也别改用别处名字相似的脚本：只有本包这一份是执行入口，参数契约独此一家。

**替换时写完整字面路径，不要用 shell 变量拼。** 先 `S=<skill-dir>` 再 `bash $S/scripts/run_graphql.sh --query-file $S/references/graphql-operations/…/xxx.graphql` 这种省字写法会让 ai-assistant 产品侧的审批闸门认不出 `--query-file` 指向哪个操作——闸门靠命令里的字面路径识别操作，认不出就按最严档 fail-closed，用户看到的确认卡片只剩一整段原始命令，而不是操作名和对象。所以 `--query-file`、`--vars-file`、`--env-file` 的值都写成字面值、不经 shell 变量拼出；写操作的 `--query-file` 给完整绝对路径（`--env-file` 沿用 `~/.config/...` 写法不受影响），一条命令只带一个 `--query-file`。

### Windows（PowerShell）等价写法

`run_graphql.sh` 只是 `exec node -- <skill-dir>/scripts/_lib/run_graphql.mjs "$@"` 的外壳，不加任何参数。Windows 上没有 bash 也不需要 bash：**执行入口换成 `node <skill-dir>\scripts\_lib\run_graphql.mjs`，后面的参数一个字都不变**（`--vendor` / `--env-file` / `--query-file` / `--vars-file` / `--vars-json` / `--identity` / `--envelope` / `--pretty` / `--confirm-mutation-target` / `--save-to*` / `--check-update` 全部相同，输出契约与退出码也相同）。不用 `.ps1`，PowerShell 默认的执行策略会拦下脚本文件，直接跑 `node` 没有这个问题。

本文件其余地方凡写 `bash <skill-dir>/scripts/run_graphql.sh …`，在 PowerShell 里按下表替换：

| macOS / Linux 写法 | Windows PowerShell 写法 |
|---|---|
| `bash <skill-dir>/scripts/run_graphql.sh …` | `node <skill-dir>\scripts\_lib\run_graphql.mjs …` |
| `~/.config/openbayes-skills/.env.<vendor>` | `$HOME\.config\openbayes-skills\.env.<vendor>`（即 `%USERPROFILE%\.config\openbayes-skills\`，运行时按同一规则查找） |
| `cp .env.example .env.openbayes` | `Copy-Item <skill-dir>\.env.example $HOME\.config\openbayes-skills\.env.openbayes` |
| `mkdir -p ~/.config/openbayes-skills` | `New-Item -ItemType Directory -Force $HOME\.config\openbayes-skills` |
| `env -u OPENBAYES_TOKEN -u OPENBAYES_GRAPHQL_ENDPOINT bash …` | 先 `Remove-Item Env:OPENBAYES_TOKEN, Env:OPENBAYES_GRAPHQL_ENDPOINT -ErrorAction SilentlyContinue`，再跑 `node …` |
| `[ -n "$OPENBAYES_TOKEN" ] && echo set \|\| echo not-set` | `if ($env:OPENBAYES_TOKEN) { 'set' } else { 'not-set' }` |
| `--vars-json '{"id":"x"}'` | 同样写法在 PowerShell 7 可用；**Windows PowerShell 5.1 会吃掉引号**，带引号的变量一律改 `--vars-file <abs>\vars.json` |

路径里的 `\` 与 `/` 运行时都认；`--env-file` 用绝对路径，`<skill-dir>` 替换成 `SKILL.md` 所在目录的真实绝对路径（如 `C:\Users\<你>\.claude\skills\openbayes-user`），与 macOS 一样不要用变量拼。「凭据安全」那条禁令对 `.mjs` 同样成立：`.env.*` 只能作为 `--env-file` 的参数出现。

Run GraphQL query or mutation:

```bash
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes --query-file /abs/path/query.graphql --vars-file /abs/path/vars.json
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes --query-file /abs/path/query.graphql --vars-json '{}'
```

Check which account a credential belongs to (no request, no token printed — see 「多账号切换」):

```bash
bash <skill-dir>/scripts/run_graphql.sh --env-file /abs/path/.env.<profile> --identity
```

Mutation example:

```bash
bash <skill-dir>/scripts/run_graphql.sh \
  --vendor openbayes \
  --query-file /abs/path/mutation.graphql \
  --vars-file /abs/path/mutation-vars.json \
  --confirm-mutation-target "<vendor>:<endpoint-of-current-env>"
```

`--confirm-mutation-target` 的值是 `<vendor>:<endpoint>`，endpoint 跟当前环境 `OPENBAYES_GRAPHQL_ENDPOINT`（或 `.env.<vendor>` 里同名键）一致；不同环境下值不同（容器内/本机/私有部署各异）。**不要硬编码示例里的字符串**；具体取值方式见 `references/graphql-discipline.md` → "Mutation 二次确认目标"。

## Output Contract

`run_graphql.sh` 默认行为：

- **成功** → stdout 直接是 GraphQL 响应里的 `data` 对象（**不带 envelope 包裹**），exit 0。例如查询返回顶层字段 `jobs` 时，下游一句 `JSON.parse(stdout).jobs` 即可。
- **失败** → stderr 打印格式化错误（含错误类型、消息、endpoint、operation），exit 非零
- **JSON 输出默认 minified**（单行无空白），人工阅读时加 `--pretty` 切到带缩进的形态

失败覆盖：传输层错误、env / token 缺失、mutation gate 不通过、GraphQL validation 错、以及即使 transport 200 但 GraphQL 响应里包含 `errors` 字段的情况（partial 也算错）。

大返回的落盘方式（`--save-to-default`）与"mutation 返回 null 且无 errors = 静默失败"的判读见 `references/graphql-discipline.md`。

### `--envelope` 排障逃生口

加 `--envelope` 后 stdout 变成完整 envelope JSON（含 `ok` / `endpoint` / `token_source` / `result.errors` / env 解析 trace 等元数据），exit code 与默认模式一致（错误时仍退非零）。需要看 partial error 详情、debug env 文件解析、追溯 token 来源时使用。

成功形态：

```json
{
  "ok": true,
  "vendor": "openbayes",
  "endpoint": "...",
  "operation_type": "query",
  "token_source": "...",
  "ssl_verify": true,
  "result": { "data": { "<field>": ... }, "errors": [ ... ] }
}
```

失败形态：

```json
{ "ok": false, "error": { "type": "...", "message": "..." }, "vendor": "...", "endpoint": "...", "operation_type": "..." }
```

## 版本自查与反馈

用户从 openbayes.com 安装的包里带 `<skill-dir>/VERSION`；没有人能把更新推给他，只能拉。规则：

- **每次会话首次进入 execution mode 时，在跑第一条 GraphQL 命令之前先跑一次** `bash <skill-dir>/scripts/run_graphql.sh --check-update`（Windows 同上换 `node`）。它自己限流：**每 24 小时最多向 `versions.json` 发一次请求**，时间戳落在 `~/.config/openbayes-skills/update-check.json`（不在 skill 目录里，重装不会丢），不到时间就直接用上次的结论，网络失败也只是输出里多一个 `error` 字段、退出码仍为 0。所以不用自己算「今天查过没有」，也不要自己 `curl` `versions.json`。
- 输出 `update_available: true` 时，**把当前任务做完**，在回答末尾加一句提醒：当前 `current`、最新 `latest`、`changelog` 链接，以及「再贴一次安装 prompt 即可覆盖升级，凭据文件在 `~/.config/openbayes-skills/` 不受影响」。**不要中断任务去升级，也不要替用户执行升级**。
- 输出 `current: null`（没有 `VERSION`，说明是从仓库 clone 软链安装的开发态）时什么都不用提。

反馈入口只有一个：**support@openbayes.com**（法定工作日 10:00 到 18:00）。用户报问题、提需求时给他这个地址，并帮他把邮件主题按 `[openbayes-skills <VERSION>] 一句话说明问题` 拼好（`<VERSION>` 取 `--check-update` 输出的 `current`，或直接读 `<skill-dir>/VERSION`），正文附上失败命令的 `--envelope` 输出，**去掉 token**（`--envelope` 本身不含 token，但别把 `.env.*` 内容贴进去）。
