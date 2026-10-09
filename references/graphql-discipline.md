# GraphQL 调用与结果处理约定

本文件覆盖通过 `run_graphql.sh` 调用 OpenBayes GraphQL 网关时的字段裁剪、结果落盘、以及 schema 上易踩的陷阱。

**模板是起点，不是契约。** `references/graphql-operations/` 下的 `.graphql` 文件列出了每个实体上可读的字段集合，但 GraphQL 的核心优势就是**按需取字段**。当用户的问题只需要少量字段时，把查询裁剪到只保留那几个字段，可以显著缩短上下文、减少响应噪音、加快解析——这对同一会话中要反复调用查询的场景尤其重要。

## 传参方式

`run_graphql.sh` 支持两种查询入口，挑选时按下面的判断：

- `--query-file /abs/path/to/template.graphql`：使用完整模板。适合首次探查、字段关系复杂、或要做写回校验时。
- `--query '<inline graphql>'`：直接传入裁剪后的内联查询。适合一次性读取、字段极少、用户明确只问某一两个属性时。

变更型操作（mutation）请继续使用模板文件，避免现场拼接出错。

## 结果输出：inline vs 文件

默认结果直接写到 stdout。如果你预期返回会偏大（list 查询、20+ 行、或单条数据本身嵌套很深），加上 `--save-to-default`，`run_graphql.sh` 就会把完整 `data` 写到一个本地文件，stdout 只回一段轻量 descriptor：

```json
{
  "saved_to": "/tmp/openbayes-graphql/Jobs-20260507-103255.json",
  "operation": "Jobs",
  "operation_type": "query",
  "size_bytes": 47312,
  "shape": "object",
  "rows": 47,
  "preview": {
    "fields": ["id", "name", "status", "createdAt"],
    "first": { "id": "j-abc", "name": "demo", "status": "RUNNING" }
  }
}
```

文件以 pretty-printed JSON 落地，跨轮可达。

**`preview.fields` 是 descriptor 给你的 schema crib**——`saved_to` 文件里每条记录的可选字段已经在 `fields` 里列出来，可以**直接据此写 jq 投影/筛选**，不必再回去翻 `.graphql` 模板对字段名。读它用普通 shell 工具：

- `jq '.[] | select(.status=="RUNNING") | {name, http: (.links[]|select(.name=="http")|.value)}' <saved_to>` —— 过滤 + 投影（适合需要 nested 字段时，例如 `Link` 数组里挑 `name=="http"` 的 value）
- 其余常规读法：`jq '.[5]'` 取第 N 条、`wc -l` 行数、`head -n 30` 看原貌

**重要**：看到 descriptor 后**不要**重新跑同一个 query 想"看更多行"——文件里已经有全部数据，直接读文件就行。

适用：list 类 read、20+ 字段的单实体探查、后续会多次回看的数据。不适用：一次性确认（`createJob` 返回 `{id, status}` 这类）、已裁剪到 < 1KB 的返回——直接 inline。

可选：用 `--save-to <abs/path>` 显式指定文件位置；默认目录 `/tmp/openbayes-graphql/`，可通过环境变量 `OPENBAYES_GRAPHQL_CACHE_DIR` 覆盖。

## 裁剪原则

GraphQL 的核心契约是「客户端声明要哪些字段，服务端就只返回那些字段」——schema 不会强制下发完整对象，没列出的字段一律不出现在响应里，对应的嵌套实体也不会被解析。**裁剪就是字面意义上的物理删除**：把不要的字段名（连同它们的嵌套块、参数、变量）从查询文档里直接删掉，服务端那部分数据连出库都不会出。

规则：

- 只保留用户当下关心的字段；没用的变量也一并从 operation signature 里删掉
- 嵌套对象按需保留：不需要 `resource.memory` 就不要展开 `resource`
- 分页信息（`pageInfo`）、`links`、`runtime`、`project` 等附带对象，除非下游要用，否则删除
- 仍需遵守现有业务规则，例如写入或重启前的 read-back verification 应读取到足以判断成功的字段

### 举例：把完整模板裁剪到「在跑的 job 列表」

`references/graphql-operations/compute/load-my-jobs.graphql` 类的完整模板一次拉 20+ 字段：

```graphql
query LoadMyJobs($u: ID!, $status: [JobStatus!], $page: Int = 1) {
  party(id: $u) {
    jobs(status: $status, page: $page) {
      data {
        id
        name
        status
        mode
        runtime { name version }
        resource { name gpuType memory diskSize }
        project { id name }
        links { name value }
        createdAt
        updatedAt
        owner { username displayName }
      }
      pageInfo { current total }
    }
  }
}
```

用户只问「我有哪些在跑的 job」——呈现需要 `id`、`name`，过滤靠传入的 `status: [RUNNING]`。其它一概不要，逐项删：

1. **删嵌套块**：`runtime` / `resource` / `project` / `links` / `owner` 全部不出现，对应嵌套实体不会被拉
2. **删元数据**：`mode`、`createdAt`、`updatedAt` 删掉
3. **删分页信息**：`pageInfo` 用户没问就别拉
4. **删未用变量**：`$page` 走默认值；`$status` 改为字面量 `[RUNNING]`，signature 里就不必再列

裁剪后：

```graphql
query($u: ID!) {
  party(id: $u) {
    jobs(status: [RUNNING]) {
      data { id name status }
    }
  }
}
```

返回体从 KB 级压缩到几十字节。如果用户后续追问「这个 job 跑在什么资源上」，再加 `resource { name gpuType }` 即可——按需扩展永远比一次性拉全字段后再让模型挑要省。

## 传输层失败 ≠ 查询写错了

`fetch failed`、连接被重置、长时间挂起后超时——这些是**网关/网络层**的失败，不是
GraphQL 层的失败。两者的处置方式完全相反，先分清楚：

| 现象 | 层次 | 该做什么 |
|---|---|---|
| `fetch failed` / 连接重置 / 无响应超时 | 传输层 | **读查询原样重试**；**写 mutation 见下方警告** |
| HTTP 200 + `errors[]`（`GRAPHQL_VALIDATION_FAILED`、`Cannot query field`…） | GraphQL 层 | 回去读 `.graphql` 模板和 `schema.graphql`，别猜着改字段名重试 |
| HTTP 200 + `data` 里目标字段为 `null` 且无 `errors` | 业务层 | 见下方「Mutation 返回 null 且无 errors = 静默失败」 |

把传输层失败当成查询写错，会触发一轮毫无意义的改字段名重试——查询本来就是对的。

### ⚠️ 只有读查询可以直接重试

传输层失败**不代表服务端没执行**。请求可能已经被接受、只是响应回不来。对 query 无所谓，
对 mutation 则意味着重试会**再做一次**：`createJob` 重复建容器（并重复计费），
`createDepositByBankTransfer` 重复入账，`restartWorkspace` 重复触发状态转换。

所以 mutation 传输失败时：**先查状态，再决定**。用对应的 read-back 查询确认这次操作
到底有没有生效（新 job 在不在、流水有没有落、status 变没变），确认没生效才重发同一份
payload。查不出来就停下来问用户，不要赌。

### 处置顺序（读查询）

1. **原样重试 1–2 次。** 这类失败多数是瞬时的。
2. **还失败就裁剪。** 重查询（多层嵌套、大分页、一次拉全平台列表）明显更容易触发超时；
   按「裁剪原则」把字段砍到当下真正需要的那几个，再试。把一次大查询拆成几次小查询，
   通常比重试同一个大查询更有效。
3. **缩小分页。** `page`/`size` 调小，分多次取。
4. **仍然不通**才考虑 endpoint / VPN / 网络问题，并告诉用户你已经试过什么。

不要在传输层失败后直接向用户报告"查不到该资源"——**没拿到响应和拿到空响应是两回事**，
混为一谈会得出"这个用户没有 job""这个集群没有 runtime"这种错误结论。如实说是网络失败。

### catalog 类查询失败时的 fallback

`load-job-runtime-catalog` / `load-shared-resource-catalog` 这类枚举查询返回集大、字段多，
是最容易超时的一类。当它反复失败、而用户的请求其实只需要**一个可用的
runtime/resource 字符串**时，绕开枚举：

- 读一个**已知能跑的 job**（用户自己近期的 job 最好），从它的
  `runtime { framework version }` 和 `resource { name }` 里组装出字符串复用。
  openbayes-user 包用 `compute/load-job-context.graphql`；admin 包用各自的全局 job 查询。
  构造规则见 openbayes-user 包的
  `references/graphql-operations/compute/create-job.vars.md`（admin 上下文里经由同机安装的
  user 包读取，同本文开头对 `bootstrap.md` 的约定）。
**这只是候选值，不是通过校验的配置。** 一个跑过的 job 只证明那套配置**当时**可用：
runtime 可能已 deprecated，resource 可能已满载或该用户已不再负担得起。
`affordable` / `isFullLoad` / deprecated 这些 gate **只有 catalog 有**，
这条路径一个都验证不了。

所以**不要**拿它直接去 `createJob`——`create-job.md` 的 Resource and Billing Gates
是必过项，不因 catalog 查不到而豁免。正确做法：

- 用这个候选值**再试一次窄查询**（只查这一个 runtime / resource 的状态），比枚举全表容易成功；
- 窄查询也不通，就**停下来告诉用户**：catalog 不可用、拿到了 job X 的历史配置作为候选、
  但无法确认它当前是否可用，请用户决定是等待重试还是照此风险继续。

只有明确取得用户同意时才带着未校验的配置往下走，并在总结里写明哪些 gate 没验证。

## 字段命名常见陷阱

实际容易踩、靠经验猜会写错的几个 schema 形状：

- **`Link` 类型是 `{ name, value }`，不是 `{ ssh, frontend, notebook }`**。
  ```graphql
  # ❌ 错（把 link 的 name 值当字段用）：
  links { ssh frontend notebook }

  # ❌ 错（REST/HAL 风格的字段名，OpenBayes schema 不用）：
  links { rel href }

  # ✅ 对：
  links { name value }
  ```
  渲染给用户时再做 `links.find(l => l.name === 'ssh').value` 这类客户端筛选。

- **分页包裹**：list 类查询常常是 `{ data: [...], pageInfo: {...} }` 形状（没用 Relay 的 `edges/node`）。要列出来：
  ```graphql
  jobs(status: [RUNNING]) { data { id name status } }
  ```
  不是 `jobs(first: 50) { edges { node { ... } } }`。

- **`Tag` 的输出统一是对象，输入按 operation 区分，不能凭字段名猜类型**：

  | 场景 | Schema shape | Variables example |
  |---|---|---|
  | create Dataset | `[TagInput]` | `[{ "name": "vision" }]` |
  | create Project | omit for default ML; `[TagInput]` only for HPC | omitted or one internal HPC channel input |
  | `UpdateDatasetInput.tagNames` | `[TagInput]` | `[{ "name": "vision" }]` |
  | `UpdateProject.tagNames` | `[String!]` | `["vision"]` |
  | `tagNames` list filters | `[String!]` | `["public"]` |

  Read-side `tags` remains `tags { name }`. Before any full-set update, read `references/concepts/resource-tags.md`; tag arrays are complete desired sets, not deltas。

- **枚举值大写**：`status: [RUNNING]`、`mode: WORKSPACE`，不是 `"running"` / `"Workspace"`。

- **看起来像标量的字段往往是对象**。`resource`、`runtime`、`project`、`owner` 在 Job 上都是 object 类型，必须展开子字段：
  ```graphql
  # ❌ 错（Field "resource" of type "Resource!" must have a selection of subfields）：
  jobs { data { id resource } }

  # ✅ 对：
  jobs { data { id resource { verboseName gpuResource } } }
  ```
  规则：遇到 `Cannot query field` / `must have a selection of subfields` 这两类错误，先查模板，再决定要不要展开。

- **`permissions.canWrite` ≠ 顶层 `canEdit` / `canUpdate`**（两层 `can*` 字段，含义截然不同）。看起来像同义词，实际不是一个东西：

  | 字段路径 | 性质 | 跟"我是谁"有关吗 |
  |---|---|---|
  | `<entity>.canEdit` / `canUpdate` / `canDestroy` …（顶层） | **动作能力** — 当前请求者此刻能不能做这个动作 | 有关，未登录就是 `false` |
  | `<entity>.permissions.canWrite` / `canRead` / `canDownload` / `canAdmin` | **权限规则配置** — 组织普通成员（非 owner / creator）是否被授予对应权限 | 无关，owner 也可能看到 `permissions.canWrite=false` |

  典型混淆：以为 `permissions.canWrite=false` 就是"我不能写"——错。owner 自己往往就是 `permissions.canWrite=false`（因为这描述的是给"组织普通成员"的规则），但 owner 当然能写——看顶层 `canEdit` 就行。

  `Permissions` 是 Dataset / Job / Project / Serving / User 共享的类型，所以"实际可写"对应的顶层字段因实体而异：Project 是 `canEdit`、Serving 是 `canUpdate`、Dataset 是 `canEdit` / `canUpload` 等。决策口径：

  - 判断"当前用户能不能做某件事" → 看**顶层 `can*`**
  - 解释"为什么能 / 不能" → 看 `permissions.*` 规则源（再加 owner / creator / role 等其它判定输入）
  - 永远不要把 `permissions.canWrite` 当成"我能不能写"的答案

如果一份模板里某个字段的形状跟你预期不一样，**信模板**。看到 `GRAPHQL_VALIDATION_FAILED` / `Unknown argument` / `Cannot query field`：不要改字段名重试，回去读对应的 `.graphql` 模板。

## 分页排序陷阱

list 类查询的 `data[]` 顺序由服务端决定，**不是按你正在筛选的字段排的**。当用户问的是「最近 X 的」（最近停掉的 / 最近完成的 / 最近退款的）而你想直接 page 1 取前 N 条，**先确认这个关系的排序规则**——否则页 1 之外的数据会被静默漏掉。

### 已验证的排序行为

| 关系 | 排序键 | 典型陷阱 |
|------|--------|----------|
| `party.jobs(status, page)` | `createdAt` DESC | "最近停掉的 job"——老 job（半年前创建）昨天刚停的，会被 5 月新建的一堆 task 推到第 3 页之后 |
| `userDeposits(userId, page)` | `createdAt` DESC | 同理，"最近 fulfilled 的充值" 不等于"最近 created 的充值"（CLOSED 状态没有 fulfilledAt） |
| `party.servings(status, page)` | **复合序**：RUNNING/PREPARING 优先，然后大致按 `latestServingVersion.startedAt` DESC 但不严格 | 不要假设 createdAt 序；要"最近活跃"也得翻几页再 client sort |
| `transactions` / `userTransactions` | `createdAt` DESC（按 schema 经验，未严格验证）| 同上，"最近真扣钱的"≠"最近 created" |

当 schema 没有暴露 `orderBy` 参数时（OpenBayes 现在的状态），排序是**固定的服务端实现**，你改不了。

### 找「最近 X 的」标准动作

如果用户的语义是 endAt / fulfilledAt / updatedAt 维度，**不要只看 page 1**：

1. 拉至少 3 页（90 条），按目标字段 client-side 再排
2. 如果第 90 条的 `createdAt` 还比目标时间窗新，继续翻——直到你看到的 `createdAt` 比窗口边界更老
3. 用 `status` filter 缩小返回集合（比如 `status: [CANCELLED]`），把无关 RUNNING/SUCCEEDED 提前剔掉，能让分页效率高一截

```bash
# 反模式：page 1 拿 30 条按 endAt 排，仿佛已经全了——会漏掉老 job
bash run_graphql.sh --query 'query($u:ID!){ party(id:$u){ jobs(status:[CANCELLED], page:1){ data{ id endAt } } } }'

# 正确：翻 3 页聚合再排
for p in 1 2 3; do
  bash run_graphql.sh --query '...page:$p ...' --vars-json "{\"u\":\"...\",\"p\":$p}"
done | jq -s '[.[] | .party.jobs.data[]] | sort_by(.endAt) | reverse | .[:N]'
```

### 反模式

- ❌ "我已经按 endAt 排了" —— 你只是给 page 1 的 createdAt 序里的 30 条按 endAt 排了，page 2 那个昨天才停的老 job 还在你视野之外
- ❌ 看 `pageInfo.total` 很小就以为页 1 是全部 —— 那是该 status filter 下的总数，跟"你想要的最近窗口里的数"不是一回事
- ❌ 把"page 1 没看到"翻译成"不存在" —— 一定先确认它的服务端排序键再下结论

如果你不确定某个 list 关系的排序键，**写最小 query 取头 5 条 + 对一列 timestamp 验证一下排序**，比凭直觉假设安全得多。

## Mutation 确认分档

原则：用户点名目标可以消除「对象是谁」的歧义，但不自动免除创建、计费或状态中断操作的确认。分三档：

- **免确认**（直接做）：用户本轮点名 + 仅改元数据、可逆且零代价，如改 project 标签、job 描述、dataset 信息；创建 named serving API key 也维持免确认（零成本且可立即吊销）。
- **确认一句**（先复述目标与后果，得到肯定答复再执行）：所有创建类操作（project、dataset、空 dataset 版本、job、serving 及 serving 版本；签发 PAT 除外，见审批档）；restart-workspace 即使用户点名资源型号也要确认。其余在指令与后果之间有缝隙时同样确认——①目标是 agent 推断的；②代价真实但可逆或可挽回（stop-job / serving-version-stop：重启慢且运行时状态丢失；API key revoke / update：断线上调用方）；③范围超出所说（批量）；④权限 / 公开性 / 端口暴露变更。不可恢复的删除类已整体升入审批档，不在本档。
- **审批**（不可恢复的删除、长期全权凭据，以及动他人账号与资金）：用户自己的不可恢复删除（dataset / serving 及其版本 / job / project），签发 PAT（等同账号密码的长期凭据，改密码、登出都不失效，泄露即全账号失守），admin 包动他人账号与资金的操作。对应操作的 `.vars.md` 顶部 front matter 里 `tier: approval`；这一档在 ai-assistant 产品侧由审批机制强制拦下出卡，Claude Code 侧退化为对话确认。

**批量 / 快速流程默认不删数据。** 审批卡会打断整段流程；当用户要的是「快速跑完、别打扰我」或在一段自动化流程里，默认不把删除类操作放进流程：清理环节改用可逆动作（stop 而非 delete、只停服务保留数据），或把候选清单留给用户事后决定，并把这一点在开始时说一句。例外只有一条：用户明确点名删某个资源（「把 X 删了」），照常走审批档——不因为「在跑流程」就替用户降级或隐瞒。反过来，也不要为了绕开审批把删除偷换成别的写操作。

档位写在 `.vars.md` 的 front matter 里，同一块还写了这个操作对用户怎么讲（`title` / `effect`）、哪个变量是被操作对象（`subject`）、哪些变量值得摆到台面上（`highlight`），以及同一个模板在不同参数下算不算另一件事（`variants`，例如 `isLocked: false` 是「解锁」而不是「锁定」）。没有 front matter 在运行时会落入免确认档，但这本身不构成产品裁决：openbayes-user 的 mutation 还必须在仓库的 tier-decision ALLOWLIST 中带有免确认理由，否则 CI 拒绝发布。这块内容是给产品侧画确认卡片用的，不需要你在对话里逐字复述，但**复述目标与后果时可以直接引用 `effect`**——那句话就是为此写的。

分档改变的只是「要不要多问一句」；机制不变——所有 mutation 一律带 `--confirm-mutation-target`（下节），确认 / 审批通过后才补 flag。

## Mutation 二次确认目标

`run_graphql.sh` 对所有 mutation 强制要求 `--confirm-mutation-target` 二次确认，防止误把测试 query 打到错误网关。这个标志位的值是 `<vendor>:<endpoint>`，**endpoint 必须精确匹配脚本本次调用实际打的网关 URL**——这个 URL 来自环境配置，不是固定字符串。

endpoint 的解析顺序（见 `run_graphql.mjs`）：

1. 当前 shell 环境变量 `OPENBAYES_GRAPHQL_ENDPOINT`
2. `.env.<vendor>` 文件里的 `OPENBAYES_GRAPHQL_ENDPOINT`（通过 `--env-file` 或 `~/.config/openbayes-skills/` / 当前工作目录）
3. 内置的 vendor 公网默认值（`openbayes` → `https://openbayes.com/gateway/graphql`，`hyperai` → `https://app.hyper.ai/gateway/graphql`）

跨环境的实际差异都体现在第 1/2 步：**容器内**部署一般把 `OPENBAYES_GRAPHQL_ENDPOINT` 注入成集群内网网关（如 `http://openbayes-graphql-gateway/graphql`、HyperAI 集群里也是内网形态），**本机标准 CLI** 通常走公网默认值或自填的公网 URL，**私有部署 / on-prem** 则是各自的内部域名。不要凭印象抄值——同一个 vendor 在不同环境下 endpoint 可能完全不同。

### 容器内部署：`OPENBAYES_PUBLIC_BASE_URL`

服务端用请求的 host 拼 `Job.links.value` / `Serving.links.value` 等 URL。当 endpoint 走内网网关时，返回的 `links` 也带内网 host（如 `http://openbayes-graphql-gateway/jobs/.../...?token=...`），用户浏览器解析不到。

为这种部署多注入一个 env：

```
OPENBAYES_GRAPHQL_ENDPOINT=http://openbayes-graphql-gateway/graphql
OPENBAYES_PUBLIC_BASE_URL=https://openbayes.com
```

`run_graphql.sh` 在拿到响应后会扫所有字符串：能 `new URL()` 解析、且 host 等于 internal endpoint host 的，把 scheme + host 改写成 `OPENBAYES_PUBLIC_BASE_URL` 的；path / query / hash 不动。ws/wss 与 http/https 配对（public 是 https 时改写为 wss，反之 ws）。非 URL 字符串（`ssh root@... -p...`、`ssh.openbayes.com:32182`）、不同 host 的 URL（auxiliary 的 `*.gear-c1.openbayes.net`）原样保留。

未设置 `OPENBAYES_PUBLIC_BASE_URL` 时脚本不做任何事——本机直接打公网的场景零影响。

拿到当前生效的 endpoint，三种办法任选：

1. **跑一次 read 加 `--envelope`，从 envelope 里抄**：
   ```bash
   bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes --envelope \
     --query 'query{ me{ id } }' | jq -r '.endpoint'
   ```
   拼上 vendor 前缀就是 `--confirm-mutation-target` 的值。
2. **直接读环境**：`echo "$OPENBAYES_GRAPHQL_ENDPOINT"`；为空则读对应 `.env.<vendor>` 文件里的同名键。
3. **故意打错 mutation**：脚本拒绝时错误信息会回显期望值，照抄。

SKILL.md `Execution Commands` 节里的示例使用占位符 `<vendor>:<endpoint-of-current-env>`，**不是**可直接复制粘贴的字面值。

## Mutation 返回 null 且无 errors = 静默失败

`run_graphql.sh` 把"transport 200 + `errors` 字段非空"也判为失败（partial error 也算错），但有一类情况它**不会拦**：响应里 `data.<field>` 是 `null`、`errors` 字段不存在或为空。脚本看到的是合法 GraphQL 响应，从协议层面没问题——但服务端 resolver 实际拒绝了你的请求。**视同失败**，不要当成"成功但无 payload"。

### 怎么识别

```json
{
  "data": {
    "createDeposit": null
  }
}
```

- response 顶层没有 `errors` 字段（或为空数组）
- `data.<mutation_name>` 是 `null`
- exit code 是 0（脚本不感知 resolver-level 拒绝）

### 真实案例

- `createDeposit(input: { paymentChannel: INTERNAL_TEST, ... })`：服务端只允许 `ALIPAY`/`STRIPE`/`AIRWALLEX`，遇到非在线渠道直接返 null 不抛错。正确路径是 `createDepositByBankTransfer`。
- 跨 owner 操作未授权资源：有些 mutation 在权限缺失时返 null 而非显式 permission error。
- 已被删除/不存在的 ID：少数 query/mutation 会以 null 静默替代"not found" error。

### 该怎么做

1. **当作失败汇报**给用户："服务端静默拒绝了这次写入"，不要乐观地说"已生效"
2. **read-back 验证**：对应的 list / detail query 拉回来看实际数据是否变化。例如 `userDeposits`、`userTransactions`、相应实体的 `load-*`、或前一步的 mutation 输出
3. **检查 mutation 选错的可能性**：很多 null 是"对的 schema 形状、错的 mutation"。换一个候选 mutation 比换参数靠谱
4. **不要换参数盲试**：把同一 mutation 的 amount、ID 等微调重发，几乎不会让 null 变 success——拒绝点通常在 channel / type / 权限维度

### 反模式

- ❌ "mutation 返回 null 没报错，应该是成功了"——错。GraphQL 协议里 null 是合法但通常意味着 resolver 出错或拒绝
- ❌ 换 amount / 改 ref / 加 description 重试 createDeposit，期待 null 变成对象
- ❌ 没有 read-back，直接告诉用户"已成功"

## 何时走完整模板

- 首次了解实体 schema 或排查字段命名
- 写入/变更后的 read-back verification（需要足够字段判断成功）
- 用户明确要求"完整信息"或"所有字段"
- 复杂分页、嵌套拉取，自己现写 inline 容易出错
