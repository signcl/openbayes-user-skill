# Console URL 双向映射（导航出去 + 解析进来）

本文件是 console URL 的**双向映射表**：正向（skill 要带用户去某页面 → 路由表）与反向（用户贴了 URL → 「URL → 资源解析表」定 ID 类型和首查 GraphQL）。正向怎么用取决于运行环境：确认在 console surface（拿到 console 导航指引）时 → 用 `navigate` 直接导航；其他情况（普通 Claude Code / 终端，或拿不准）→ 给用户一个可点击的完整 URL，见下方「不在 console 环境时」。

> 与 `references/ui-links.md` 分工不同：
> - **某个已经查到的具体资源**（某个 job / dataset / serving）→ 用该实体 GraphQL 返回的 `links.frontend`（见 `ui-links.md`），**优先**走这条。
> - **列表页 / 新建表单 / 设置 / 财务 / 公共资源等 section 页面**（没有 GraphQL link）→ 用下面的路由表。

## URL → 资源解析表（用户贴 URL 进来时查这里）

用户贴任何 console URL 进来，**先查这张表**定 ID 类型和首查 query，不要临时 grep schema 推断。URL 尾部可能多出版本号（`/0`、`/{ver}`）或 tab 段，解析时容忍并忽略；`{ns}` 可能是 org slug，作 `userId` 传入。

**ID 辨别法**：projectId 含大写字母（如 `Fi5yeHoDsh1`）；jobId 是小写 base36（如 `70ccfkofmk0z`）。把 projectId 传给 `job(userId, jobId)` 会得到「找不到该资源」，且无法靠编码反解——走 `project(projectId)` 再取 job。

| URL pattern | 实际是 | ID 类型 | 第一步 GraphQL |
|---|---|---|---|
| `/{ns}/containers/{id}` | project | projectId | `project(projectId)` → `.jobs(userId, projectId, status:[RUNNING], mode:WORKSPACE)` 取 `jobs.data[].id` |
| `/{ns}/jobs/{id}` | job | jobId | `job(userId, jobId)`（`compute/load-job-context.graphql`） |
| `/{ns}/hpc/{id}` | project（rewrite→containers；仅 OpenBayes） | projectId | 同 containers 行 |
| `/{ns}/datasets/{id}[/{ver}]` | dataset | datasetId | `dataset(datasetId)`（`dataset/dataset-read-detail.graphql`） |
| `/{ns}/models/{id}[/{ver}]` | dataset（rewrite→datasets） | datasetId | `dataset(datasetId)`，category=MODEL |
| `/{ns}/servings/{id}` | serving | servingId | `serving(userId, servingId)`（`serving/serving-read-overview.graphql`） |
| `/public/tutorials/{id}` | 公开教程 project | projectId | `project(projectId)` → `latestJob.id` → 按需 `jobReadMe` + `jobJupyter`（两路独立：README 为 null ≠ 失败，教程正文常在 .ipynb） |
| `/public/notebooks/{id}` | 同上（rewrite→tutorials；rewrite 写的是 `/:username/notebooks`，但 `:username` 段会匹配字面量 `public`） | projectId | 同上 |
| `/public/datasets/{id}[/{ver}]` | 公开数据集 | datasetId | `dataset(datasetId)` |
| `/public/models/{id}[/{ver}]` | 公开模型（不 rewrite，有独立页面） | datasetId | `dataset(datasetId)`，category=MODEL |

公开资源的后续动作（读 README / 克隆 / 绑定）见 `references/workflows/common/explore-public-resources.md` 的「By URL / By ID」分支。

## navigate 约定

- 发出**相对的、对用户友好的路径**，例如 `/{ns}/containers`。
- `{ns}` = 当前用户的 username；在某个组织上下文里操作时用该组织的 slug。公共资源页不带 `{ns}`（`/public/...`）。
- **不要**自己拼 `/overview`、`[tab]`、版本号，也**不要**带 `/console` 前缀或任何 host —— 相对路径才能在 OpenBayes 与 HyperAI 两个部署间通用（各自 basePath 不同），console 端会自动补全前缀、rewrite 会补全 tab/版本。
- username 从 `whoami` / 鉴权上下文已知；组织上下文用 org slug。

## 不在 console 环境时（给完整 URL）

这套 skill 多数时候跑在普通 Claude Code / 终端里，**没有浏览器**。是否真的在 console 内由上游 orchestrator（ai-poc）按请求头 `X-Surface: console` 决定——只有这时它才会给你 console 导航指引，**skill 读不到这个 header**。

⚠️ 在 hosted 客户端里，orchestrator **按客户端注册工具**：只有 console 边栏才会给你 `navigate` 工具，standalone 与普通 harness 都没有它。所以判据很简单——**你手上有 `navigate` 工具就用它导航；没有（或拿不准）就按下面给用户一个可点击的完整 URL**（URL 在哪都能用）。

构造完整 URL 时**不要硬编码 host 或 `/console` 前缀**（OpenBayes 与 HyperAI 不一样）：

1. 从本会话里任意一个已从 GraphQL 拿到的实体 `links.frontend` 截出 console base —— 即 `/{username}/...` 之前的部分（host + 可能的 `/console`）。例：`https://openbayes.com/console/zhangsan/jobs/n8t` → base = `https://openbayes.com/console`。
2. base 拼上方路由表里的相对路径：`<base>/{ns}/containers`。
3. 手头还没有任何 `links.frontend` 时：先跑一次廉价 list 拿一个再截（`whoami` 不返回 `links`）。
4. list 也拿不到时，用本会话 GraphQL 调用同样的 `--vendor` / `--env-file` 跑一次 `run_graphql.sh --identity`（不联网）：输出里有 `public_base_url`（容器内部署）就用它的 host，否则用 `endpoint` 的 host；OpenBayes 的 console base 是 `https://<host>/console`（生产、next 实测 `https://<host>/gateway/graphql` ↔ `https://<host>/console`）。HyperAI 的对应关系未实测，HyperAI 跳过这一步。
5. 以上都不行，直接告诉用户去 console 打开哪个页面（如「打开 console → 容器列表」），**不要瞎猜 host**。

**别默认写 `https://openbayes.com`**：beta、next、私有部署的用户点过去是别的站点，账号不在那里。

## 何时导航

导航是**补充**，不是替代取数。仍然照常用 GraphQL 把用户问的数据查出来作答；导航用于让用户去操作或查看上下文（例如列完 job 后顺手带他到容器列表页；用户明确说"带我去 / 打开 X 页面"时直接导航）。不要用导航**代替**该做的查询。

## 路由表（友好形式，`{ns}` = username 或 org slug）

**计算 / 容器**
- `/{ns}/containers` — 容器（工作空间）列表
- `/{ns}/containers/new` — 新建容器
- `/{ns}/containers/{id}` — 某个容器详情。⚠️ 这里的 `{id}` 是 **projectId**（如 `Fi5yeHoDsh1`），**不是** GraphQL 的 `job.id`（小写 base36，如 `70ccfkofmk0z`）。把它当 `jobId` 传给 `job(userId, jobId)` 会得到「找不到该资源」，也无法靠编码反解。要从这个 URL 拿到 job，用 `project(projectId).jobs(userId, projectId, status:[RUNNING], mode:WORKSPACE)` 取 `jobs.data[].id`。job 自己的 `links.frontend` 给的是 `/{ns}/jobs/{job.id}` 形式，那个 id 才直接是 jobId。
- `/{ns}/hpc/new` — 新建 HPC 任务 **（仅 OpenBayes；HyperAI 无 HPC，不要导航）**
- `/{ns}/hpc/{id}` — 某个 HPC 任务详情 **（仅 OpenBayes）**；底层重定向到 container 详情视图。要跳到某个具体 HPC 任务，优先用它的 GraphQL `links.frontend`。
- HPC 没有独立列表页：HPC 任务与普通容器同在 `/{ns}/containers` 列表（`/{ns}/hpc` 重定向到 containers）。「看 HPC 列表」去 `/{ns}/containers`。

**数据仓库**
- `/{ns}/datasets` — 数据集列表
- `/{ns}/datasets/new` — 新建数据集
- `/{ns}/datasets/{id}` — 某个数据集详情
- `/{ns}/models` — 模型列表
- `/{ns}/models/new` — 新建模型
- `/{ns}/models/{id}` — 某个模型详情

**部署 / Serving**
- `/{ns}/servings` — serving 列表
- `/{ns}/servings/new` — 新建 serving
- `/{ns}/servings/{id}` — 某个 serving 详情

**自动化**
- `/{ns}/hypertunings` — 超参搜索列表
- `/{ns}/hypertunings/new` — 新建超参搜索
- `/{ns}/automl` — AutoML 列表
- `/{ns}/automl/new` — 新建 AutoML

**财务**
- `/{ns}/finance` — 财务总览
- `/{ns}/finance/transactions` — 交易流水
- `/{ns}/finance/deposit` — 充值
- `/{ns}/finance/fapiao` — 发票
- `/{ns}/finance/coupon` — 兑换码 / 优惠券

**账户 / 组织**
- `/{ns}/settings/account` — 账户设置
- `/settings/account/personalAccessToken` — Personal Access Token 管理页（不带 `{ns}`；没登录会先登录再回跳）
- `/{ns}/quota` — 配额
- `/{ns}/org` — 组织管理
- `/{ns}/org/new` — 新建组织
- `/{ns}/ssh` — SSH 公钥
- `/{ns}/notification` — 通知
- `/{ns}/referrals` — 推荐 / 邀请返利

**公共资源（不带 `{ns}`）**
- `/public/datasets` — 公共数据集
- `/public/models` — 公共模型
- `/public/tutorials` — 公共教程

## 来源 / 维护

路由表与解析表来自 `openbayes-console` 仓库 `pages/` 目录结构加 `next.config.js` 的 rewrite 规则（别名与自动补 `/overview`、版本 `/0` 的行为已在上表内逐行标注）。console 新增或重命名顶层 section 时，回来同步本文件的两张表。
