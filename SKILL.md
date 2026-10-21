---
version: v0.37.1
name: openbayes-user
description: "OpenBayes/HyperAI personal/个人 resources. Trigger when: OpenBayes token/token值/.env.*(只作 --env-file 参数, 绝不读内容), 我的/个人 job/workspace/task/container, serving/部署/把 serving 起回来/重启 serving/serving 观测(延迟/首 token/metrics), dataset, public resources, clone tutorial, project, org self-management. Container dev triggers: 容器/workspace 内 ssh/Jupyter/8080/暴露端口/端口映射/auxiliary 502/sandbox/缺 sandbox/启动 gradio demo/挂后台/output/input/pip/conda/tmux/tensorboard. Platform account finance triggers even without vendor word: 我的钱怎么这么快花完了/余额/balance/钱花哪了/扣钱/流水/transaction/subscription/我的配额/额度. NOT for: global admin/all platform jobs/cluster/node/GPU/user admin or household expense ledger."
---

# OpenBayes User Skill

Manage personal OpenBayes resources via GraphQL.

## Capability Scope

| Area | Scope |
|---|---|
| Jobs / workspaces | Create, read, update, delete, start, stop, restart, inspect logs/status/settings. Workspace is a `Job` subtype. |
| Servings | Create/read/update/delete servings, start/stop versions, inspect logs/status. |
| Datasets | Create/read/update/delete datasets, upload files, manage permissions. |
| Resource Tags | Read tag policy/catalog and apply assignment constraints for Dataset / Project tag updates and clone flows. |
| Public resources | Browse public datasets/models/tutorial projects; inspect README/notebooks; prepare bindings; clone tutorials. |
| Org self-management | Read-only orgs, roles, pending invites, members, resource lists. Mutations stay in console. |
| Personal access tokens | 自己签发 / 查看 / 吊销长期 API 凭据（PAT）。 |

广义触发词 `公共资源` / `公开资源` / open resources 都进这一节（`公共` 与 `公开` 等价）。问得宽泛时（"看看有什么公共资源"），先按文档列出三类（公共数据集 / 公共模型 / 公共教程）并问用户要看哪类，再检索筛选——别一上来就 dump 三类，也别因为"容器里没脚本"就放弃真实查询。完整入口逻辑见 `references/workflows/common/explore-public-resources.md` 的 Entry 节。
Org 详情见 `references/concepts/org-management.md`。

## 凭据安全（硬性约束）

**唯一登录入口是 `run_graphql.sh --login --vendor <name>`。** 无 session 或认证失败时在同 profile 重新授权，不使用历史 `.env` 或导出 token 登录，不索要长期 token。session 与 pending 由客户端管理，Agent 不读写其内容、不回显 token；历史 `.env.*` 也不读取。登录与自定义环境的两段式流程见 `references/runtime-setup.md`；授权后用 whoami 核对 username、roles、endpoint，身份变化须先问用户。

登录、自定义环境、退出和身份核对见 `references/runtime-setup.md`；首次登录后的用户上下文加载见 `references/workflows/common/bootstrap.md`。

**"给我个 token / 生成 API 凭据 / 吊销 token / 我有哪些 token"都是 PAT 管理操作，不是读
文件。** 走 `references/workflows/common/manage-personal-access-token.md`——签发、查看、
吊销是三件不同的事，进去先分流，别把吊销请求当成签发（PAT 只能给自己签，明文只返回
一次，落盘用 `--save-to` 安全交付外部调用方，不导入 skill 登录、绝不回显）。用户问"我现在的 token 是什么值"仍然
是上面那条禁令——取不到，只能验证有效性或重签。

## Documentation Mode

以下场景只使用本地 references，不需要 token，也不需要 bootstrap：

- 概念解释和平台能力说明
- "什么是 workspace / job / 配额 / 余额"类定义题
- workflow、GraphQL operation、参数解释
- 故障排查建议和执行步骤整理
- 公共文档内容的总结与对比

定义题不要跑 `whoami.graphql` 或 introspection；只有真实账户状态、线上资源列表、或写操作才进入 execution mode。

## Execution Mode

需要真实读取或修改线上资源时进入 execution mode。Bootstrap（whoami）**只在依赖用户上下文的操作前**执行；纯元数据查询直接发请求即可，省一次往返。

**要 bootstrap**：

- 创建 / 修改资源（create-task / workspace / vm / serving / dataset、restart-job 等）—— 要 `account.balance` / `quota` / `features` / `limitations` 预判可行性
- 需要 `username` 作为查询参数（如 `load-my-jobs` 列我自己的 job）
- token 状态可疑（连续被服务端拒认证）—— 跑一次确认 token 未过期、账户未锁定

**可以跳过**：

- runtime catalog / resource catalog 等元数据查询
- 公开数据集 / 教程 / 模型浏览
- 按已知 ID 直接读具体对象（job by id、dataset by id 等）

需要 bootstrap 时：

1. **以 `--query-file` 方式直接运行 `references/graphql-operations/common/whoami.graphql`**，不要现场拼 `me { ... }` 查询。模板已按 schema 展开 `account`、`quota`、`limitations`、`orgs` 等对象字段；自己拼很容易把 `account.balance` 写成 `balance`、把 `orgs` 写成 `organizations`，或把 `quota` / `limitations` 当标量列出来。
2. 从返回结果中读取：`username`、`displayName`、`roles`、`account.balance`、`account.debtMoney`、`quota`、`limitations`、`orgs`、`jobs`
3. 检查 token 是否过期、账户是否锁定、是否存在欠费

详见 `references/workflows/common/bootstrap.md`；命令形态见 `references/runtime-setup.md`。

Bootstrap 返回的上下文应贯穿整个会话，后续操作中需要 userId 时使用 `username`，需要判断功能可用性时参考 `features` 和 `limitations`。

## Execution Model

Key rules:

- Your token only grants access to your own resources.
- If the user asks how many jobs/workspaces are running, treat it as a read-only listing/count request: bootstrap if needed, query `party.jobs(status:[RUNNING,CREATED,QUEUED,CANCELLING])`, and do not ask what they want to do with the jobs.
- **`mode == SANDBOX` 的 job 是 Agent 基础设施，默认对用户隐藏**：面向用户的 job 列举/计数（`load-my-jobs`、whoami 的 `jobs`、`project.jobs`/`latestJob`）先剔除 SANDBOX 条目再展示，不提及有隐藏；`party.jobs` 的 `modes` 参数在服务端排除，`load-my-jobs.graphql` 已默认只要用户侧的 mode。用户点名 sandbox 或给出其 id 时如实回答。`links.sandbox` 亦不作为访问链接展示。细则：`references/workflows/compute/list-jobs.md`。
- User-scope serving reads use `serving-read-overview`, `serving-read-version`, or `serving-list`; never use admin-global serving ops.
- Confirm destructive writes. 不可恢复删除（dataset / serving 及版本 / job / project）是 **approval 档**（模板：`graphql-operations/compute/job-delete` / `project-delete`、`dataset/dataset-delete`、`serving/serving-delete(-version)` 的 `.vars.md`）。**批量 / 快速流程默认不删数据**：审批卡会打断整段流程，清理环节用 stop 等可逆动作或留给用户事后点名，并在开始时说一句；例外是用户明确点名删某资源时照常走审批，不降级不隐瞒。分档细则见 `references/graphql-discipline.md`「Mutation 确认分档」。If user says a workspace is `RUNNING` and asks stop/restart, refuse first: it may 中断/误停 active shells, kernels, tmux, downloads, or training in this workspace.
- `RUNNING` workspace guard: missing `sandbox`, empty `/input*`, or binding issues allow only read-only inspect; require takeover/独占确认 or 新建 workspace.
- Present data in structured, scannable formats.
- Default to GraphQL-first execution. Prefer GraphQL reads, GraphQL mutations, and read-back verification before considering any UI path.
- **Mutation returning `data.<field> == null` with no GraphQL errors = silent failure**, not silent success. Always read-back before reporting success; do not retry the same mutation with different parameters hoping null becomes a value. See `references/graphql-discipline.md` → "Mutation 返回 null 且无 errors = 静默失败".
- For post-create or post-restart follow-up, prefer `job.links.ssh`, `job.links.frontend`, and `job.links.workspace` / `job.links.workspace-with-password` returned by GraphQL over browser automation. (`links.notebook` is a deprecated alias for `workspace`.)
- When the user wants to open JupyterLab, get the Jupyter login password, SSH password, or a deep link to a specific notebook file, the authoritative reference is `references/ui-links.md` — read it before constructing any workspace URL or echoing `Job.password`. Key facts: `Job.password` is simultaneously the JupyterLab token, the `?token=` value in deep links, and the SSH password; deep-link shape is `<workspace-base>/lab/tree/<rel>?token=<password>` where `<rel>` is the file path relative to `notebook_dir` (`/openbayes` on OpenBayes, `/hyperai` on HyperAI).
- Do not use browser or devtools tools unless the user explicitly asks for UI interaction, page inspection, clicking, screenshots, or another browser-only action.
- For long-running remote commands executed through `links.ssh`, follow `references/workflows/common/ssh-best-practice.md`.

## Container Development

本 skill 同时覆盖以运行中容器为目标的开发工作——通过 SSH 远程操作，或在容器内直接开发。生命周期管理（创建、停止、重启、删除容器）不属于此节，使用下文 Compute/Serving 工作流。

### Triggers — 看到这些信号必须先读 references

无论用户是中文还是英文表达，**只要会话进入"在某个 RUNNING job/workspace 内部干活"的语境，先读对应 reference，再回答**：

| 用户意图 / 触发词 | 必读 reference |
|---|---|
| 打开 jupyter / 打开 notebook / 进 lab / 浏览器打开 / "给我个链接" / 直接打开某个文件 / deep link | `references/ui-links.md`（link 选择 + `Job.password` = JupyterLab token = SSH 密码 + `lab/tree/<rel>?token=` 构造） |
| 带我去 / 打开…页面 / 跳转 / 在 console 里打开某个列表或表单 | `references/console-navigation.md`（console 页面路由表 + navigate 工具约定；区分"具体资源用 GraphQL link"与"section 页面用路由表"） |
| 用户贴了任何 console URL（`/{ns}/containers/{id}`、`/{ns}/jobs/{id}`、`/public/notebooks/{id}` 等，含 `/public/...`）/ 给的是链接不是 id | **先查 `references/console-navigation.md` 的「URL → 资源解析表」**定 ID 类型和首查 query，勿直接把 URL 里的 id 当 jobId（containers 的 `{id}` 是 projectId，详见表）。容器内干活另见 `references/workflows/common/container-dev-quickref.md`「从 console 容器 URL 拿到 job」 |
| ssh 进去 / ssh 密码 / 远程连接 / 我登不上去 / 长任务跑不掉 / tmux / 在 workspace 里运行程序 / 挂后台进程 / 启动 demo 或训练 | `references/workflows/common/workspace-runtime.md` + `references/workflows/common/ssh-best-practice.md` + `references/workflows/common/container-dev-quickref.md` |
| 在容器里执行命令 / 读写容器文件 / 不想配 ssh / 用 HTTP 操作容器 / sandbox 接口 / 缺 sandbox 想重启 | `references/workflows/common/container-dev-quickref.md`「Sandbox HTTP API」——普通 CLI 默认 SSH/scp；Mastra/HTTP-only/no-SSH 场景才优先 sandbox；缺 sandbox 不重启 |
| 装依赖 / pip / conda / uv / 持久化 / 重启后还在不在 | `references/workflows/common/container-dev-quickref.md` +（按运行时）`references/openbayes-docs/gear/conda.md`（Conda 运行时）或 `references/openbayes-docs/gear/uv.md`（uv 运行时，Ubuntu 24.04+ 如 vllm≥0.20 / pytorch≥2.11）。两类运行时持久化都走 `pip install --user`（落 `/output/.pylibs`）；uv 运行时**别用 `uv pip --user`**（不支持），也别只为持久化建 venv |
| 我跑起来了怎么打开 / 给我 demo 的网址 / gradio·web UI·LLM API 的链接 / 公网访问·在线访问 / auxiliary 是哪个 / demo 打不开·502·空白 | `references/workflows/compute/access-job-service.md`（多数教程跑起来就是靠这个 URL；8080 应用 ⇒ `links.auxiliary`，非 8080 ⇒ 该端口的 link。**别从字段拼 URL，读 `links`**） |
| 调用 gradio 应用 / 用这个 gradio 帮我生成·跑一下 / call the gradio API / 把结果拿回来 / 这个 demo 的接口怎么调 | `references/workflows/compute/call-gradio-app.md`（探测 `/gradio_api/info` → 替用户调用并返回产物。**只想打开 URL** 用 `access-job-service.md`） |
| 暴露端口 / port forward / 映射一个新端口 / 我的服务该监听哪个端口 | `references/workflows/compute/update-job-ports.md` + `references/graphql-operations/compute/update-job-ports.vars.md`（`ports` 整体替换；无特殊端口要求时优先监听 `0.0.0.0:8080`，走 `links.auxiliary`；仅固定非 8080 端口需映射，字段 `name`；禁映射 8080） |
| `/output` / `/input*` / 工作空间满了/存储剩余0/无存储额度 / 写到哪里 / 容量 / 数据集挂载位置 | `references/workflows/common/storage-semantics.md` |
| tensorboard / 监控 / metrics | 概念与 UI：`references/openbayes-docs/gear/tensorboard.md` + `references/openbayes-docs/gear/metrics.md`；直接取某个 job 的指标数值（GPU/显存/利用率等时间序列）：`references/graphql-operations/compute/job-metrics.graphql` |
| 容器间互相 ssh / 同一账号多容器协作 | `references/openbayes-docs/gear/internal-ssh.md` |
| 把 `/output` 里的产物缓存进 dataset / 重复下载太慢想存下来 / "怎么把模型挪到数据集" | `references/workflows/dataset/populate-version.md`（含 RW→RO 双重启 + bayes CLI 备选 + 反模式） |
| 下载模型 / model download / huggingface / modelscope / hf / ms / 怎么在容器下模型 | `references/workflows/dataset/download-model.md`（**先搜公共模型**，没收录才下载；vendor 优先 registry、直下 RW 挂载数据集〔机制走 populate-version Path A〕、CPU 实例省钱；下载命令本身在 `references/openbayes-docs/data-warehouse/import-public-models.md`） |
| 上传本地代码到 workspace / 把本地脚本跑到 OpenBayes 上 / upload my train.py / 下载 checkpoint / 下载产物到本地 / end-to-end remote compute | `references/workflows/compute/run-experiment-end-to-end.md`（普通 CLI 默认 SSH/scp；Mastra/HTTP-only 可用 sandbox） |

不要凭印象回答这些问题——这些 reference 里有 deprecated 名字、密码三重身份、`notebook_dir` 因平台不同的细节，错一个用户就会卡住。

### 快速参考

容器开发高频问题速查: `references/workflows/common/container-dev-quickref.md`

### 详细参考

- Workspace 内运行程序与后台进程: `references/workflows/common/workspace-runtime.md`
- SSH 接入与长任务管理: `references/workflows/common/ssh-best-practice.md`, `references/openbayes-docs/gear/ssh.md`, `references/openbayes-docs/gear/internal-ssh.md`, `references/openbayes-docs/gear/ssh-tunnel.md`
- 持久化存储: `references/openbayes-docs/gear/storage-persistence.md`, `references/workflows/common/storage-semantics.md`
- 打开运行中服务的公网 URL（教程 demo / gradio / LLM API）: `references/workflows/compute/access-job-service.md`
- 调用运行中的 Gradio 应用（探测 `/gradio_api/info` → 替用户调用 → 产物存 cwd）: `references/workflows/compute/call-gradio-app.md`
- 服务暴露与端口映射: `references/workflows/compute/update-job-ports.md` (+ `references/graphql-operations/compute/update-job-ports.vars.md`), `references/openbayes-docs/gear/expose-service.md`
- 开发环境: `references/openbayes-docs/gear/workspace.md`, `references/openbayes-docs/gear/conda.md`（Conda 运行时依赖管理）, `references/openbayes-docs/gear/uv.md`（uv 运行时依赖管理）, `references/openbayes-docs/gear/tensorboard.md`, `references/openbayes-docs/gear/metrics.md`
- UI link / Jupyter 深链 / `Job.password` 身份: `references/ui-links.md`
- Console 页面导航路由 / navigate 工具: `references/console-navigation.md`

## Finance

### Triggers — 看到这些信号先读 references

| 用户意图 / 触发词 | 必读 reference |
|---|---|
| 为什么余额没了 / 钱花在哪 / 上个月花了多少 / 钱怎么扣的 / why is my balance gone / 我的钱怎么这么快花完了 / 没买东西为什么扣钱 / 帮我分析一下花费 | `references/workflows/finance/inspect-transactions.md`（用户自服务费用分析，多源 stitching） |
| 配额 / 额度还剩多少 / 还能跑多久 / 同时能开几个 / 提示超限 | **余额**=钱（`account.balance`）；**配额**=算力时长与存储余量（`load-quota.graphql`，如某资源剩 19 小时、存储 50GB）；**limitations**=各类上限，主要是同时能开几个（resource / gpu 级），也含数据集·项目·快照个数与上传大小（`references/workflows/common/check-limitations.md`，含超限报错翻译与个人/集群限制之分）。规则见 `references/openbayes-docs/gear/limitation.md`——**该页把 limitations 叫"配额限制"，别据此和配额混为一谈**。判定：**算力 quota=0 ≠ 开不了**——那只是订阅分钟数用完，余额>0 且资源 `affordable: true` 即可按量启动，别据此答"不能用"或建议先充值订阅（`references/workflows/common/bootstrap.md`「quota ≠ capability」） |

## 分页列表（所有实体通用）

任何列表返回 `pageInfo` 时，先读 `references/graphql-discipline.md`「分页字段与计数」。`total` 是当前条件下的总个数；本页条数看 `data.length`，总页数按实际每页条数计算。此规则覆盖任务、项目、数据集、部署、流水、用量、成员及嵌套列表，不限于 job。

## Operation Discovery

不要凭记忆拼 GraphQL——schema 不在你的记忆里：可执行请求以 `references/graphql-operations/` 下的 operation 模板为准（schema 本身的参考是 `references/graphql/schema.graphql`）。发现一个操作应该花 1–2 步，不是 5 步：

1. **直奔目录**：按领域直接读 `references/graphql-operations/<area>/`（area：common / compute / serving / dataset / org），文件名自描述，通常不用搜就能选中。`skill_search` / 全文检索是**兜底**——只在真猜不出 area、或选中的 area 里翻不到对应 operation 时用，不是默认第一步。
2. **优先 `--query-file <绝对路径>` 跑模板**，不必现场内联或裁剪 `--query`（何时值得裁剪见下文 Field Trimming）。
3. **发现一次，复用路径**：同一会话里不要重复检索同一个 operation；参数值没拿到之前不要用猜的值先跑一发。

结果报 `GRAPHQL_VALIDATION_FAILED` / `Unknown argument` / `Cannot query field` 时，**回去重读 operation 文件**，不要换个猜法重试。

## GraphQL Field Trimming

通用约定（`--query-file` vs `--query`、`--save-to-default` 描述符与 jq 用法、裁剪原则、字段命名陷阱、何时走完整模板）：见 `references/graphql-discipline.md`。下面只放 user skill 特有的工作示例。

`party.jobs` / `project.jobs` 只做 status 过滤（无 `sort`/`orderBy`，默认 `createdAt DESC`）。"最近停掉/活动"走 `party.projects(lastJobActiveAt DESC) → latestJob`；不要 `party.jobs` page 1 后按 `endAt` 重排。详见 `references/workflows/compute/list-jobs.md`。

**召回 / 模糊检索**（"我最近有没有做 X 相关的"这类按主题找资源的问题）：见 `references/workflows/common/flexible-recall.md`——别用一次字面 `q` 查空就回"没有"，要做变体扩展（`opencode` → `open-code` / `open`）并在仍稀疏时放宽后由模型语义筛。

### 示例：列出我当前在跑的 job

完整模板 `references/graphql-operations/compute/load-my-jobs.graphql` 一次返回 20+ 字段。若用户只问"我有哪些在跑的 job"：

```bash
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes \
  --query 'query($u:ID!){ party(id:$u){ jobs(status:[RUNNING]){ data{ id name status } } } }' \
  --vars-json '{"u":"<username>"}'
```

返回体从 KB 级压缩到几十字节。若之后用户追问资源/运行时信息，再加字段或切回完整模板即可。

### 示例：只看当前配额

完整 `whoami` 一次拉账号上下文 20+ 字段（昵称、组织、订阅、limitations、quota、运行中 job 列表等）；inline 返回约 3 KB，常常被下游 `head -c` / `jq` 截断造成解析失败。若用户只问"我还剩多少 GPU 分钟 / 存储"：

```bash
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes \
  --query 'query{ me{ quota{ storageQuota{ remainMegaBytes totalMegaBytes } computationQuota{ key value{ availableMinutes } } } } }'
```

返回 < 200 字节，直接 inline 即可；不需要走 `--save-to-default`。

## Core References

- GraphQL schema: `references/graphql/schema.graphql`
- Common operations: `references/graphql-operations/common/`
- Usage records operation: `references/graphql-operations/common/load-usages.graphql`
- Transaction history operation: `references/graphql-operations/common/load-transactions.graphql`
- Compute operations: `references/graphql-operations/compute/`
- Serving operations: `references/graphql-operations/serving/`
- Dataset operations: `references/graphql-operations/dataset/`
- Bootstrap workflow: `references/workflows/common/bootstrap.md`
- Common workflows: `references/workflows/common/`
- Compute workflows: `references/workflows/compute/`
- Serving workflows: `references/workflows/serving/`
- Dataset workflows: `references/workflows/dataset/`
- Public resources workflow: `references/workflows/common/explore-public-resources.md`
- 模糊召回 / 关键词检索纪律（"有没有做过 X"类问题：变体扩展 + 放宽语义筛，关键词查空 ≠ 不存在）: `references/workflows/common/flexible-recall.md`
- Resource visibility concepts: `references/concepts/resource-visibility.md`
- Org permissions concepts: `references/concepts/org-permissions.md`
- Org management concepts (角色 / 成员 / authorization): `references/concepts/org-management.md`
- Org workflows: `references/workflows/org/`
- Org GraphQL operations: `references/graphql-operations/org/`
- Gear platform docs: `references/openbayes-docs/gear/`
- 容器开发相关文件（quickref、workspace-runtime、storage-semantics、call-gradio-app、ui-links、console-navigation）不在此重复——路由入口见上文 Container Development 触发表。

## Serving Lifecycle Routing

`ServingVersion` is immutable — `runtime`, `resource`, `dataBindings`, `predictor`, `sourceCode` are baked in at version create time and cannot be edited afterwards. Pick the workflow by intent, not by surface verb:

| User intent / 触发词 | Workflow | Mutation |
|---|---|---|
| serving 日志 / 实时日志 / 请求 502 / 查启动错误 | `references/workflows/serving/read-serving-logs.md`（历史 HTTP + 有界 WebSocket 采样） | 只读 |
| 重启 serving / serving 被关了起回来 / 把停掉的 version 拉起来 / restart cancelled version | `references/workflows/serving/restart-serving.md` | `updateServingVersion(input: { replica: <currentReplica> })` |
| workspace 改了想重新发版 / 升级 runtime / 换 resource / new serving version | `references/workflows/serving/create-serving-version.md` (with preflight) | `createServingVersion` |
| 调 replica / 扩缩容 | `references/workflows/serving/update-serving-version.md` | `updateServingVersion(input: { replica: <new> })` |
| 改 description | `references/workflows/serving/update-serving-version.md` | `updateServingVersion(input: { description: ... })` |
| 第一次部署一个 serving（已有调好的 source job） | `references/workflows/serving/create-serving.md` (with preflight) | `createServing` |
| 从零部署一个模型 / 下了个模型想做成 API / 部署 huggingface 模型 / 手上只有模型没有 job | `references/workflows/serving/build-serving-from-scratch.md`（编排：模型入库 → workspace 里充分测通 start.sh → preflight → create。**默认推荐先在 workspace 测**：serving 没有 shell、每次都是冷启动，出问题只有日志可看。但这是推荐不是强制——脚本已知可用时直接把带 `start.sh` 的 dataset 挂 `/output` 部署也合法，serving 不要求 source job） | 见链路各步 |
| 停止一个 version | `references/workflows/serving/stop-serving-version.md` | `stopServingVersion` |
| 删除 version / 删除 serving | `references/workflows/serving/delete-serving-version.md` / `delete-serving.md` | `deleteServingVersion` / `deleteServing` |

⚠️ Common confusion: **restart ≠ new version**. Restart is `updateServingVersion` with the same `replica` — re-deploys the existing immutable version. Creating a new version (`createServingVersion`) for a config-identical restart wastes a version number and breaks version-pinned monitoring. If unsure, ask.

When constructing `ServingDataBindingInput` by hand (create flows), the field names are **inverted relative to the schema**: `name` = data reference, `path` = mount path. See `references/workflows/serving/create-serving.md#servingdatabindinginput-fields`.

## Compute Create Routing

**支持的 job mode 只有 `WORKSPACE` 和 `TASK`。** `VIRTUAL_MACHINE`、`BATCH_TASK`、`BATCH_WORKSPACE`、`WORKSPACE_SNAPSHOT` 一律不支持——不作为创建选项暴露，不因用户点名"虚拟机"就去拼 payload，也不在 workspace 创建/重启失败时退到它们；用户明确要时如实说明当前不支持。例外：克隆公开教程遇最新版为快照时，按克隆教程工作流的快照路径以 `mode: WORKSPACE`（非快照）复刻。`SANDBOX` 更进一步：它是 Agent 内部基础设施（见上文隐藏规则），**任何情况下不替用户创建**——点名要建时只说明这是平台内部机制、不开放创建，不展开细节、不给替代拼法。这是本包的权威声明，其他文件只做指引。

For create flows, prefer mode-specific workflows instead of directly using the generic create-job workflow:

- Create workspace: `references/workflows/compute/create-workspace.md`（空账号只说想试试、跑个notebook时，先推荐克隆公开教程）
- Create task: `references/workflows/compute/create-task.md`

Use `references/workflows/compute/create-job.md` only as a compatibility fallback when mode is still ambiguous.

For both create flows, support the same project shortcut:

- If the caller provides `projectId`, treat it as an existing project target and validate `project.canCreateJob`.
- If the caller provides `projectName` without `projectId`, treat it as a `create project + create job` shortcut.
- In write flows, do not silently resolve or reuse an existing project by name. Existing-project writes should use `projectId`.

## Resource Tag Routing

Policy: `references/concepts/resource-tags.md`.

| 用户意图 | 路由 |
|---|---|
| 查看标签目录 / 分配能力 | `references/workflows/common/list-resource-tags.md` |
| 更新 Dataset 标签 | `references/workflows/dataset/update-dataset-info.md` |
| 更新 Project 标签 | `references/workflows/compute/update-project-tags.md` |
| 克隆教程 | `references/workflows/compute/clone-tutorial.md` |
| `projectName` 建 Project + Job | `references/workflows/compute/create-project.md` → `references/workflows/compute/create-job.md` |

### Runtime catalog 路由

`common/` 下有三份 runtime catalog 模板，**都查同一个 `normalClusterRuntimes` 字段**，差别只在 `runtimeType` 默认值。挑选时按下表，**不要展开三份比较**：

| 场景 | 模板 | 备注 |
|------|------|------|
| 容器 task / workspace | `common/load-job-runtime-catalog.graphql` | 调用方传 `runtimeType: [CONTAINER]`；按需加 RDMA 等 `labels` |
| 诊断 / 复查（不预限类型）| `common/load-runtime-catalog.graphql` | 默认 `[CONTAINER, VM]`，一次返回两类。restart / preflight / debug 等"先看 runtime 还在不在"的场景使用 |

## 环境配置与执行命令

首次登录（浏览器授权与一次性码兑换）、`run_graphql.sh` 查询/mutation 命令形态、输出契约（成功 stdout=`data`、失败 stderr+非零 exit、`--envelope` 排障）统一见 `references/runtime-setup.md`——**执行第一条 GraphQL 命令前先读它**。要点：

- mutation 必须带 `--confirm-mutation-target "<vendor>:<endpoint-of-current-env>"`，值随当前环境变化，**不要硬编码示例字符串**（取值方式见 `references/graphql-discipline.md` → "Mutation 二次确认目标"）。
- 用户尚未登录时发起两段式浏览器授权，兑换后核对 whoami 并继续原任务，不索要或代填长期 token。
