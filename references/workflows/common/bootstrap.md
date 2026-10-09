# Bootstrap — 身份验证与上下文加载

只在依赖用户上下文的操作前执行此流程：

- **创建 / 修改资源**：需要 `account.balance` / `quota` / `features` / `limitations` 预判可行性
- **需要 `username` 作为查询参数**（如 `load-my-jobs`）
- **token 状态可疑**：连续被服务端拒认证（401/403），跑一次确认 token 未过期、账户未锁定

纯只读元数据查询（runtime catalog、resource catalog、公开资源浏览、按已知 ID 直接读对象）不需要 bootstrap，省一次往返。

如果当前任务只需要基于本地 references 做解释、排障或流程说明，同样不需要 bootstrap。

## 目的

1. 验证 token 有效性（未过期、格式正确）
2. 确认当前用户身份（username、displayName、roles）
3. 获取账户余额和欠费情况
4. 获取 quota 概况（存储、算力、共享算力）
5. 获取资源与 GPU 并发限制及当前使用量
6. 获取所加入的组织及其角色
7. 获取当前运行中的 jobs（判断是否有可操作的 workspace）
8. 判断用户经验水平，调整后续引导策略

## 执行

```bash
bash <skill-dir>/scripts/run_graphql.sh \
  --vendor openbayes \
  --query-file /abs/path/to/references/graphql-operations/common/whoami.graphql \
  --vars-json '{}'
```

`me` 查询不需要任何变量，服务端通过 token 自动识别当前用户。

## 返回字段用途

| 字段 | 用途 |
|------|------|
| `username` | 用户标识，后续查询的 userId 参数 |
| `displayName` | 向用户展示时使用的名称 |
| `registerAt` | 注册时间，用于判断用户经验水平 |
| `roles` | 判断是否具有 ADMIN 权限 |
| `locked` | 若为 true，账户已被锁定 |
| `hasMembership` | 是否有付费会员 |
| `features` | 可用的功能开关（如 SERVING） |
| `account.balance` | 账户余额（按量付费的钱包） |
| `account.debtMoney` | 欠费金额 |
| `quota` | 存储配额、各资源类型算力配额、共享算力配额（**仅订阅套餐剩余分钟数，不是能否使用资源的判定** —— 见下方"quota ≠ capability"） |
| `limitations` | 各类资源的并发上限及当前使用量（`current`） |
| `group` | 所属分组（影响可见资源和镜像） |
| `orgs` | 所加入的组织及角色（OWNER / ADMIN / MEMBER） |
| `jobs` | 当前运行中 / 创建中的 jobs 列表。拿到响应就先剔除 `mode == SANDBOX` 条目，后续判断、展示、报数一律用过滤后的集合且不提及（Agent 基础设施，见 `references/workflows/compute/list-jobs.md`） |

## 前置检查

在继续任何操作之前检查：

- **token 过期**：客户端不做预检，过期 token 会在服务端被拒绝，返回 `GRAPHQL_EXECUTION_ERROR`，错误消息为服务端的认证失败提示（如"登录已过期，请重新登录"）。**不要就此停下让用户自己换 token**——先走"Pre-auth 边界处理"的**场景 4**：在同 vendor 的其他来源里自动找可用 token 并切换；只有同 vendor 候选全失效时才引导用户去控制台重新获取
- **账户锁定**：若 `locked=true`，通知用户账户已被锁定，大部分操作将不可用
- **欠费**：若 `account.debtMoney.amount > 0`，提醒用户存在欠费，可能影响资源创建

## quota ≠ capability

平台有两套并行计费体系，bootstrap 返回的 `quota` 只反映其中一套：

- **订阅计费**（`quota.computationQuota[].value.availableMinutes`）：包日 / 包周 / 包月套餐里的剩余分钟数。普通用户为 0 是常态。
- **按量付费**（`account.balance`）：只要余额 > 0 且目标资源 `affordable: true`，就可以按小时实时扣 balance 启动 job。

因此 **`availableMinutes = 0`（甚至某个 GPU 型号的 quota 为 0）不等于"不能用"**。不要据此告诉用户"账户没有 GPU 额度 / 需要先充值订阅"——用户多半会反驳"我有钱啊"。

判定某个资源能否启动用：

1. `resource.affordable: true` 且 `resource.isFullLoad: false`（来自 `common/load-shared-resource-catalog.graphql`）
2. `limitations.resources[resource].freeCount > 0`（并发上限）

`quota` 与 `estimatedQuota` 只做信息展示，不作为硬门槛。除非用户主动问"我订阅还剩多少分钟"，bootstrap 后无需提及 quota=0。

## 用户画像

根据返回数据综合判断用户经验水平。这不是精确分类，而是用于调整引导深度的粗粒度信号。

### 判断信号

| 信号 | 老鸟倾向 | 新手倾向 |
|------|----------|----------|
| `registerAt` 距今 | > 3 个月 | < 3 个月 |
| `limitations.resources[*].current` | 有正在使用的资源 | 无资源使用 |
| `limitations.dataset.*.current` | 有数据集 | 无数据集 |
| `limitations.project.*.current` | 多个项目 | 0 或仅 1 个 |
| 过滤后的 `jobs.data` | 有运行中 jobs | 无运行中 jobs |
| `hasMembership` | 付费会员 | 免费用户 |

综合判断，不依赖单一信号。注册很久但几乎没用过的用户仍应视为新手。

### 引导策略差异

**老鸟**：
- 减少概念解释，直奔主题
- 操作确认时只列关键参数
- 当用户说「创建容器」时，先看是否有已停止的 workspace 可重启，主动询问「重启已有的还是创建新的？放在哪个项目下？」

**新手**：
- 适当解释关键概念（workspace 是什么、资源和镜像的关系、数据绑定的作用）
- 推荐性价比合理的资源，不默认推荐最贵的
- 推荐较新的主流镜像（如最新版 PyTorch）
- 创建容器时主动说明各参数的含义和默认值
- 如果账户余额或配额紧张，提前提醒而不是等到创建失败

**空账号**（`limitations.project` 与 `limitations.dataset` 的 `privateItem.current`、`publicItem.current` 全是 0，过滤后的 `jobs.data` 为空；项目为 0 也就没有已停止的容器）：用户说想「试试 / 跑个 notebook / 开个容器」时，先推荐从公开教程克隆一个能直接跑的（`references/workflows/common/explore-public-resources.md` → tutorials），再一句话讲容器和 notebook 是什么，不要从空白容器讲起。公开教程搜出 0 个（私有部署可能如此）时照实说，改建空白 workspace。克隆后的第一步验证见 `references/workflows/compute/clone-tutorial.md` 第 5 步。

## 错误处理

| 错误类型 | 含义 | 建议 |
|----------|------|------|
| `MISSING_TOKEN` | 未找到 token | 提示用户通过 `--env-file`、环境变量、当前工作目录下的 `.env.{vendor}`，或 `~/.config/openbayes-skills/.env.{vendor}` 提供 token |
| `GRAPHQL_EXECUTION_ERROR` | 查询执行失败（含 token 过期、权限不足等服务端错误） | 读取错误消息：认证失败（token 过期/被拒）走"Pre-auth 边界处理"场景 4 自动换来源；权限不足（如缺 ADMIN）属授权问题，按对应 skill 规则处理 |
| GraphQL error | 网络或 endpoint 错误 | 检查网络连接和 endpoint 配置 |

## 后续操作中使用 bootstrap 上下文

- **创建容器**：先看 `jobs` 中是否有可重启的 workspace，结合用户画像决定引导方式；检查 `features`、`limitations`、`account.balance`
- **操作组织资源**：使用 `orgs` 中的组织 ID 和角色判断权限
- **查看余额 / 充值**：直接引用 `account.balance`
- **需要 userId 参数时**：使用 `username` 字段

## Pre-auth 边界处理

Bootstrap 的前置检查（token 过期 / 账户锁定 / 欠费）假设你已经能跑通一次 `run_graphql.sh`。本节覆盖四个场景：场景 1–3 让你**连第一次 GraphQL 都发不出去**（在 bootstrap 之前识别和恢复）；场景 4 是请求发出去了、但 token 被服务端判为过期/无效（在 bootstrap 期间或之后触发，自动换同 vendor 的其他来源）。

### 场景 1: 完全没 token

**检测**：

1. 调用 `scripts/run_graphql.sh` 时若 stderr 包含 `OPENBAYES_TOKEN not set` 或类似消息
2. 或在调用前先查 env：`echo "${OPENBAYES_TOKEN:+set}${OPENBAYES_TOKEN:-not-set}"`
3. 检查标准位置：进程 env / cwd `.env.{vendor}` / `~/.config/openbayes-skills/.env.{vendor}`

**先做一步：枚举已有 env 文件，不要直接问"要不要新建"**

token 缺失常见的真实原因不是"用户从没配过 token"，而是"用户已经配过，但当前选的 vendor 名字跟现有文件名对不上"——例如本地有 `.env.bj` 和 `.env.ecnu`（用户自定义的内部环境），用户说"用 openbayes"，脚本去找 `.env.openbayes` 找不到，结果误判成"完全没 token"。

引导新建 token 之前，**先列出现有可用的 env 文件**（只列文件名，不读内容）：

```bash
# 当前工作目录
ls -1 .env.* 2>/dev/null
# 用户级配置目录
ls -1 ~/.config/openbayes-skills/.env.* 2>/dev/null
```

如果有匹配项：

- **名字精确匹配**（如用户说"openbayes"且存在 `.env.openbayes`）→ 直接试一次，看是否就是 token 过期或 endpoint 错配（token 过期走**场景 4**自动换同 vendor 其他来源，endpoint 不可达走"场景 2"）
- **名字不匹配但有候选**（如用户说"openbayes"但只有 `.env.bj` / `.env.ecnu`）→ 把候选列出来让用户**显式选**：

  > 当前没找到 `.env.openbayes`，但看到这些 env 文件：
  > - `./.env.bj`
  > - `./.env.ecnu`
  > - `~/.config/openbayes-skills/.env.openbayes`
  >
  > 要用哪一个？或者要新配一个？

- **完全没有**（cwd 和 `~/.config/openbayes-skills/` 都空）→ 走下面的"恢复对话剧本"新建

**安全约束**：列文件名 OK；用 `cat`、`head`、`Read` 看 `.env.*` 内容**永远不行**。要确认某个文件是否有效，跑一次 `run_graphql.sh --env-file <path> --query 'query{__typename}'` 看返回。

**恢复对话剧本**（确认真的需要新建时）：默认由你帮用户建好文件并继续，别把一堆手动步骤甩给他。

1. 告诉用户去哪拿 token：
   - OpenBayes：`<console-base>/settings/account/personalAccessToken`，打开后点「创建 Token」（没登录会先登录再回到这一页）。`<console-base>` 默认 `https://openbayes.com/console`；用户提过 beta、next、私有部署，或你拿不准他在哪个站点时，先问清楚再给链接（这时还没有 token，推不出环境）。这个地址打不开（较老的控制台版本没有）就改说手动路径：右上角头像 →「账号设置」→「Personal Access Token」→「管理 Token」。
   - HyperAI：`https://app.hyper.ai/console/settings/account/personalAccessToken`
2. 给用户两条路，让他选：
   - **（默认）把 token 发我，我来建文件**：用户把 token 贴出来，你替他写好 `.env.{vendor}` 并**直接继续他最初的任务**，用户不用碰命令行。
   - **我自己准备**：用户更想自己弄时，把第 4 步的命令给他，让他建好再回来。
3. 问存哪：
   - 用户级（跨所有 cwd 可用）：`~/.config/openbayes-skills/.env.{vendor}`
   - 项目级（仅当前 cwd）：`./.env.{vendor}`
4. 写文件——**官方 vendor（openbayes / hyperai）文件里只放 token 本身**，endpoint 走运行时默认值：

   ```bash
   mkdir -p ~/.config/openbayes-skills
   printf '%s\n' '<user-provided-token>' > ~/.config/openbayes-skills/.env.openbayes
   chmod 600 ~/.config/openbayes-skills/.env.openbayes
   ```

   自定义环境（私有部署 / 集群内网）才改写成 `OPENBAYES_TOKEN=<token>`、`OPENBAYES_GRAPHQL_ENDPOINT=<endpoint>` 两行；文件里一出现 `=`，裸 token 行就被忽略。
5. 跑一次 whoami 验证 token 生效，然后**接着用户最初的请求继续**，不要停在"配置完成"。

**安全约束**：永不读取 token 值本身（不用 cat / head 看 `.env.*` 内容），写入后只验证一次 GraphQL 调用成功。

### 场景 2: Endpoint 不可达

**检测**：跑一次最小 query 时区分 curl 不同 exit code：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --connect-timeout 5 \
  "${OPENBAYES_GRAPHQL_ENDPOINT}"
EXIT=$?
```

| curl exit | 含义 | 对话引导 |
|-----------|------|---------|
| 6 | 解析 DNS 失败 | 检查 endpoint 拼写；或网络不通 |
| 7 | 连接被拒 | endpoint 可能错（不是 OpenBayes/HyperAI 主域）；检查 vendor |
| 28 | 超时 | 网络有问题或代理设置；问用户是否在企业网 / VPN |
| 0 (HTTP 4xx/5xx) | endpoint 通了但返错 | 走正常的 GraphQL 错误处理（见前置检查节） |

恢复策略对应每个 case 不同；不要把"连不上"一律提示成"token 过期"。

### 场景 3: Vendor 错配

**检测**：

1. GraphQL 通了，但 `whoami` 返 `user not found` 或类似（用户存在于另一 vendor）
2. 或 user 的口述资源类型与 endpoint 域名不符（user 说"我在 hyperai 上跑了个 job"但 `OPENBAYES_GRAPHQL_ENDPOINT` 指向 openbayes.com）

**对话引导**：

1. 检查 user 提到的资源/任务的归属（hyperai / openbayes）
2. 比对 `OPENBAYES_GRAPHQL_ENDPOINT`
3. 不一致 → 提示用户切 vendor：
   - 若已有对应 vendor 的 `.env`：用 `--vendor hyperai` / `--vendor openbayes` 切换
   - 若没有：走"场景 1"流程在对应 vendor 下配 token

**不要**默默替用户切换——可能用户在两个 vendor 都有账号，得问。

### 场景 4: 活跃 token 失效 → 同 vendor 换来源自动切换

与场景 1–3 不同：这里请求**发出去了**，但服务端把 token 判为过期/无效（whoami 或任意调用返回认证失败，如"登录已过期，请重新登录" / 401 / `GRAPHQL_EXECUTION_ERROR` 含认证失败提示）。

**核心原则：vendor 不变，自己换来源试，别停下来让用户手动换。** 要请求哪个环境由任务先定死——查 openbayes 只认 openbayes 的凭据，查 hyperai 只认 hyperai 的，**绝不跨 vendor**自动拿别的环境的 token（会打到错误 endpoint）。

**同 vendor 的 token 来源只有三个**（脚本搜索优先级去掉显式 `--env-file` 那一档后）：

1. **环境变量** `OPENBAYES_TOKEN` / `OPENBAYES_GRAPHQL_ENDPOINT`
2. **当前目录** `./.env.{vendor}`
3. **用户级** `~/.config/openbayes-skills/.env.{vendor}`

**自动恢复步骤**：

1. 记下刚失效的是哪一档来源。
2. 列出同 vendor 的其余候选——排除失效那一档，只保留实际存在的（环境变量用 `[ -n "$OPENBAYES_TOKEN" ]` 判断是否设置、文件用 `ls`/`test -f`，**都不读内容**）。
3. 逐个用 whoami probe 试，能通（200 + 有 `username`）就采用，继续原任务：
   - 环境变量来源 → 不传 `--env-file`（它在优先级里压过文件）：
     ```bash
     bash <skill-dir>/scripts/run_graphql.sh --vendor {vendor} \
       --query-file /abs/path/to/references/graphql-operations/common/whoami.graphql --vars-json '{}'
     ```
   - 文件来源 → 显式指定路径：
     ```bash
     bash <skill-dir>/scripts/run_graphql.sh --env-file ~/.config/openbayes-skills/.env.{vendor} \
       --query-file /abs/path/to/references/graphql-operations/common/whoami.graphql --vars-json '{}'
     ```
4. **admin 任务额外判定**：候选认证通过但 `roles` 不含 `ADMIN` → 记下、继续试下一个；全部候选都"有效但非管理员"时，报告这一情况并停（这是权限问题，不是换 token 能解决的）。
5. 同 vendor 三个来源全失效/不存在 → 回退到场景 1 的"恢复对话剧本"，引导用户去控制台拿新 token（**必须带 vendor 对应 URL + 要写回的文件路径/key**），不要静默失败。

**总结里必须报告**（用户的核心诉求——让他知道发生了什么）：

- 哪个来源的 token 失效了（来源档位 / 文件路径）。
- 最终用的哪个来源（来源档位 / 文件路径）+ 从 whoami 解析出的 `username` / `displayName`。
- 例：「原来用的 `./.env.hyperai` token 已过期，已自动切到 `~/.config/openbayes-skills/.env.hyperai`（账号 alice / Alice Wang）完成查询。」

**安全约束**：全程只判断来源是否存在、只跑 probe，**永不** Read / cat `.env.*` 内容、**永不**回显 token 值。"哪个 token"一律用来源档位/文件路径 + whoami 身份指代。

### 实施要点

- 场景 1–3 的**检测**都在 bootstrap 第一次 GraphQL 调用之前做；场景 4 在调用拿到认证失败后触发。
- 场景 4 的换来源是 agent **自动**完成的，事后在总结里告知用户即可，不需要事前批准；场景 1（跨 vendor / 完全没 token）、场景 2、场景 3 的恢复仍需和用户**对话**——不要假装自己能 curl 拿 token，也不要假装能 mutate `.env`。
- 走完恢复，重新进入"前置检查"节验证 token / 账户状态。
