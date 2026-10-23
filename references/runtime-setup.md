# 运行环境与执行契约

三个 OpenBayes skill 包共用的登录、身份核对、执行命令与输出约定。**首次执行 `run_graphql.sh` 前先读完本文件。**

## 登录与凭据安全

**唯一认证来源是 `--login` 创建的 `session.<vendor>.json`。** 旧 `.env.*` 中的 token、裸 token 文件和环境变量 `OPENBAYES_TOKEN` 不再用于认证，也不自动迁移。缺少 session 或认证失效时重新登录，不搜索其他凭据、不索要长期 token、不代写凭据文件。

session 与 `login-pending.<vendor>.json` 由客户端内部管理。Agent 只允许检查文件是否存在（`ls`），不使用 Read、cat、grep、脱敏管道或其他命令读取其内容，也不直接写入、复制或修改它们。历史 `.env.*` 仍可能含敏感值，同样不读取内容。任何情况下都不回显 token。

### 两段式登录

`--vendor` 是用户选择的环境 profile 名，不是品牌枚举；每个 profile 保存一份 session。名称不能为空或全为空白，不得含 `/`、`\` 或控制字符，也不能是 `.` / `..`；非法值在任何凭据文件操作前拒绝。官方 `openbayes`、`hyperai`、`beta` 自带登录地址。自定义环境先向用户确认控制台地址和 profile 名，再传 `--endpoint`：

```bash
bash <skill-dir>/scripts/run_graphql.sh --login --vendor openbayes
bash <skill-dir>/scripts/run_graphql.sh --login --vendor <name> --endpoint <控制台地址>
```

第一段打印授权页 URL 后退出，PKCE verifier 暂存在本机 pending 文件（10 分钟有效）。把 URL 交给用户：在浏览器中登录正确账号，选令牌有效期（1/7/30/90 天），确认后回传一次性授权码。客户端不自动启动浏览器，用户可以在另一台设备打开。

第一段不等待终端输入，打印后即退出：agent 与脚本环境（包括分配伪终端 PTY 的 harness）行为一致，不会卡在输入提示符上。真人在交互终端里想省掉第二段、直接在提示符下粘贴一次性码，第一段末尾加 `--paste`；agent 侧永远不加。

```bash
bash <skill-dir>/scripts/run_graphql.sh --login --vendor <name> --code <一次性授权码>
```

第二段复用 pending 绑定的 endpoint 和 verifier，匿名换取 PAT，并保存 session；不需要重传地址。一次性码过期或 pending 不存在时重新发起第一段，不反复重试旧码。旧部署无授权页时报告需要升级，不回退到手工 token 登录。

session 在 `~/.config/openbayes-skills/`，跨工作目录可用。类 Unix 平台文件权限为 0600，Windows 不提供相同的 POSIX 权限位保证。保存的是本机明文 PAT，不是系统钥匙串加密存储。

### 身份核对与恢复

登录后先跑 whoami（`references/graphql-operations/common/whoami.graphql`），确认 `username`、`roles` 和 endpoint，再继续用户最初的任务。两个 admin 包需要管理员账号；whoami 成功但缺 ADMIN 是权限问题，不是认证失效。

- 缺少 session（`MISSING_TOKEN`）：发起上述登录流程。
- 认证被服务端拒绝：在同 profile 重新授权。禁止静默换 profile、换账号，或回退旧 token 来源。
- 网络、DNS 或超时：排查网络与站点，不将其当作 token 失效。
- 重登录后的 username 与原操作身份不同：停下并让用户确认，写/admin 操作还需核对 roles 和 endpoint。

**`--logout --vendor <name>` 只删除本地 session，不吊销服务端 PAT。** 退出后即使磁盘上仍有旧 `.env` 或 shell 导出 token，也不能继续认证。吊销令牌使用 PAT 管理流程，控制台入口为 `https://openbayes.com/console/settings/account/personalAccessToken`（HyperAI 换成 `https://app.hyper.ai`，自定义环境换成用户确认的站点）。

### `--identity`：离线检查当前 session 身份

```bash
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes --identity --pretty
```

它与真实查询使用同一 session，输出 endpoint、`token_source: session:…`、sub、PAT 的 jti、expires_at、expired，不联网、不打印 token。平台 `User.id` 就是 username，userId/ownerId 参数填它。

**`verified: false` 表示没有验签，也不知道服务端是否已吊销令牌。** `--identity` 不能替代 whoami。JWT roles 是签发快照，权限以 whoami 为准。

多账号操作每次换 profile 或重登录后都跑 whoami。不能用查询响应里回显的 `party.id` 证明身份：它可能只是你传入的 id；拿错账号也可能得到 HTTP 200 和零余额、零资源。`--confirm-mutation-target` 只绑定环境，不绑定账号，不能替代身份核对。

## 非凭据配置

`.env.<vendor>` 和显式 `--env-file <path>` 仅用于非认证设置（缓存目录、公开链接域名、TLS 配置等），不能登录。选配置文件的顺序是显式文件、当前目录、用户级目录，命中即止；不在 packaged skill 目录放配置。显式路径找不到时，`.env*` basename 会尝试用户级和 cwd 回退，回执 warnings 会说明；其他文件名直接 `ENV_FILE_NOT_FOUND`。

session 始终提供 token 和已授权的 endpoint，配置文件与环境变量不能替换这两项。尚未登录时可用 `OPENBAYES_GRAPHQL_ENDPOINT` 或配置文件指定第一段登录地址，`--endpoint` 可显式指定；自定义环境推荐直接用 `--endpoint`，成功后地址随 session 保存。

**HTTPS 证书默认验证。** 登录兑换（交互或 `--code`）与查询使用同一配置：`--ssl-verify true/false` 优先于文件/环境变量中的 `OPENBAYES_SSL_VERIFY`，未设置时为 true。私有部署证书不可信时优先配置可信证书，不因请求失败自动关闭验证；只有用户明确同意才用 false。单次命令的 flag 不写入 pending，采用两段式时兑换命令也须传该 flag，或使用双方都能加载的非凭据配置。第二段加载这些设置不改变 pending 绑定的 endpoint/verifier。

其他支持的运行时环境变量包括 `OPENBAYES_GRAPHQL_CACHE_DIR`、`OPENBAYES_PUBLIC_BASE_URL`。`OPENBAYES_NO_TELEMETRY=1` 要进入 Agent 进程环境才生效，不从 `.env` 读取。集群内与公开站点地址不同的部署也要为对应 endpoint 单独登录，不能用环境变量把已登录 session 静默指向另一站点。

## Execution Commands

**`<skill-dir>` 是本 skill 包根目录（`SKILL.md` 同级），替换成真实绝对路径。** 入口固定为本包 `scripts/run_graphql.sh`，与 cwd 无关，不搜索或使用别处的同名脚本。

命令中的 `--query-file`、`--vars-file` 和 `--env-file` 使用完整字面路径，不用 shell 变量拼接。审批闸门依赖命令中的字面操作路径，写操作一条命令只带一个 `--query-file`。

```bash
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes --query-file /abs/path/query.graphql --vars-json '{}'
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes --query-file /abs/path/query.graphql --vars-file /abs/path/vars.json
```

写操作仍须按 `references/graphql-discipline.md` 的确认层级先取得用户授权，再附目标确认：

```bash
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes --query-file /abs/path/mutation.graphql --vars-file /abs/path/vars.json --confirm-mutation-target '<vendor>:<endpoint>'
```

目标 endpoint 取本次 `--identity` 或回执，不硬编码示例值。这个参数不是用户授权的替代品。

### Windows（PowerShell）

执行入口换成 `node <skill-dir>\scripts\_lib\run_graphql.mjs`，参数和输出契约不变，不依赖 bash 或 PowerShell 脚本执行策略。session 位于 `$HOME\.config\openbayes-skills\`，由客户端管理。PowerShell 5.1 会丢失 JSON 引号，复杂变量使用 `--vars-file`；PowerShell 7 可用 `--vars-json`。路径中的斜杠与反斜杠都支持。

## Output Contract

- 成功：stdout 直接是 GraphQL `data` 对象，不带 envelope，exit 0。
- 失败：stderr 为格式化错误，exit 非零。传输错误、配置/登录缺失、mutation gate、GraphQL validation 和 HTTP 200 但含 errors（含 partial）都算失败。
- JSON 默认单行，`--pretty` 改为缩进格式。
- `--envelope` 输出完整回执（ok、endpoint、token_source、result、配置解析 trace 等），不改变错误退出码，不含 token。用于排障，不打开 session 或历史 env 文件。
- 大结果用 `--save-to-default`；落盘和 mutation 返回 null 的判读见 `references/graphql-discipline.md`。

## 版本自查与反馈

每次会话首次进入 execution mode，在第一条 GraphQL 命令前跑 `bash <skill-dir>/scripts/run_graphql.sh --check-update`（Windows 换 node）。客户端每 24 小时最多查一次版本，状态在用户配置目录 `update-check.json`；网络失败不阻塞任务，无需自行 curl 或算时间。

`update_available: true` 时先完成原任务，回答末尾提醒 current、latest、changelog 链接和重贴安装提示词升级；不代执行升级。凭据在用户配置目录，重装 skill 不影响 session。没有 VERSION 的开发态输出 current=null，不必提醒。

反馈入口：**support@openbayes.com**（法定工作日 10:00 至 18:00）。帮助用户准备主题 `[openbayes-skills <VERSION>] 一句话说明问题`，附失败命令的 `--envelope` 回执，不附 token、session、pending 或历史 env 文件内容。
