# Explore Public Resources

Use this workflow when the user wants to browse, search, or inspect public datasets, models, or tutorials on OpenBayes.

## Goal

Help the user discover and understand public resources (datasets, models, tutorials) available on the platform, and prepare for downstream actions like data binding or tutorial cloning.

## Terminology & Concept Grounding

The platform's user-facing definition lives in `references/openbayes-docs/open-resources/index.md` (公共资源概览). It defines exactly three types: **公共数据集 / 公共教程 / 公共模型**.

`公共资源` = `公开资源` = "open resources" — `公共` and `公开` are used interchangeably across the product and docs. Treat **any** of these as a trigger for this workflow: the broad terms (`公共资源` / `公开资源` / open resources / "有什么公开资源" / "公开资源都有啥") and the per-type names (`公开/公共数据集`, `公开/公共模型`, `公开/公共教程`). Do not get stuck on the exact wording.

## Resource Types

OpenBayes provides three types of public resources, all queryable via GraphQL:

| Resource | Query | Category Filter | Content Query |
|---|---|---|---|
| Public datasets | `publicDatasets` | `DATASET` | `datasetReadMe` |
| Public models | `publicDatasets` | `MODEL` | `datasetReadMe` |
| Public tutorials | `publicProjects` | — | `jobReadMe`, `jobJupyter` |

Public datasets and models are both stored as `Dataset` entities with different `category` values. Public tutorials are `Project` entities with public jobs.

## Intent to Query Mapping

All browse intents pass `tagNames: ["public"]` by default (see Search Flow step 3).

- `public.browse.unspecified` -> **do not query yet.** Run the disambiguation reply in Entry below (list the three types, ask which one).
- `public.browse.datasets` -> `dataset/dataset-search-public.graphql` with `category: [DATASET]`
- `public.browse.models` -> `dataset/dataset-search-public.graphql` with `category: [MODEL]`
- `public.browse.tutorials` -> `compute/project-search-public.graphql`
- `public.browse.all` -> only when the user explicitly asks for **everything across all three types** ("全都列出来", "三类都看"); a bare broad ask is `unspecified`, not `all`.
- `public.read.dataset-readme` -> `dataset/dataset-readme.graphql`
- `public.read.job-readme` -> `compute/job-readme.graphql` — README and .ipynb are two independent channels; a null readme just means `/openbayes/home/README.md` doesn't exist, not a failure
- `public.read.job-jupyter` -> `compute/job-jupyter.graphql` — tutorial content usually lives in the .ipynb, so check this even when `jobReadMe` is null

## Deterministic Steps

### Entry: Disambiguate Before Querying

Public-resource asks come in two shapes. Branch on which one you get **before** running any query:

- **Specific** — names a type (数据集 / 模型 / 教程) or gives a keyword / resource name ("有没有 stable diffusion 的公开教程", "看看公开模型", "PASCAL_VOC 数据集"). Skip clarification; go straight to Search Flow.
- **By URL / By ID** — the user pasted a `/public/...` console URL or already has a concrete ID ("看看这个教程 https://openbayes.com/console/public/notebooks/xxx", "数据集 ID 是 yyy"). Skip search entirely; resolve via the「URL → 资源解析表」in `references/console-navigation.md`: tutorials/notebooks → `compute/load-project-context.graphql` for metadata + `latestJob.id`, then `job-readme` / `job-jupyter` as needed; datasets/models → `dataset/dataset-read-detail.graphql`.
- **Broad / unspecified** — "看看有什么公共资源", "公开资源都有啥", "平台上有哪些公共资源". Do **not** silently dump all three lists. First reply with the three public-resource types — grounded in `references/openbayes-docs/open-resources/index.md` — with a one-line description of each, then ask which type the user wants to browse (and an optional keyword). Run the query only after they pick.

  Suggested clarify reply (adapt wording):

  > OpenBayes 的公共资源分三类：
  > - **公共数据集** —— 平台周期性收录的通用标注数据集（如 PASCAL_VOC），只读绑定到容器不占个人存储。
  > - **公共模型** —— 预训练模型权重 / checkpoint，可在创建容器时绑定，也可一键部署为 serving。
  > - **公共教程** —— 可「克隆」后直接跑起来的示例项目 / Notebook。
  >
  > 想先看哪一类？有具体关键词（比如某个数据集名、某个模型）也一起告诉我，我帮你检索筛选。

**Browsing public resources is a normal read-only GraphQL query** (`publicDatasets` / `publicProjects`). It does **not** need bootstrap, a running job, or any in-container helper script — run `scripts/run_graphql.sh` directly. Never end your turn by telling the user you "can't fetch the list" and substituting a static description as the final answer; that is a failure, not a fallback. If the script genuinely cannot run in the current environment, say so explicitly and state what is blocking it, rather than presenting the doc table as if it were the live result.

### Search Flow

1. Confirm the ask is **specific** (per Entry above). If it is still broad, run the disambiguation reply first and stop until the user picks. Otherwise classify the user's intent into one or more resource types (datasets, models, tutorials).
2. Map intent to the appropriate query with category filter.
3. Run the search with `q` parameter (empty string for browsing) and **always pass `tagNames: ["public"]`** — that is the filter the website's public pages use; omitting it returns extra listings that aren't surfaced in the product UI. 当用户是在按主题召回（"有没有关于 X 的公开教程 / 数据集"）而首查为空时，按 `references/workflows/common/flexible-recall.md` 做变体扩展与放宽，别一次查空就回"没有"。**另：关键词是中文 AI 品牌/模型名（`通义千问`、`深度求索`…）时，即使首查有结果也要再用英文/罗马名（`Qwen`、`DeepSeek`）查一遍并合并——中文名常只命中子集甚至 0 条（见「跨语言别名」）。**
4. Read total count from `pageInfo.total` (it reflects the filtered count, not the page size) and report it to the user.
5. Return results with key metadata:
   - For datasets/models: name, category, owner, latest version, binding identifiers, tags
   - For tutorials: name, description, owner, job count, latest job mode, tags —— `latestJob.mode == SANDBOX` 时略过该 job（隐藏规则见 `references/workflows/compute/list-jobs.md`）；`runningJobCount` 是否含 SANDBOX 未经验证，别拿它回答精确计数
   - When giving the user an entry link, quote `links` with `name == "frontend"` from the same result (see Frontend URLs below).
6. When results span multiple resource types, group them by type in the response.

### Inspect Flow

1. When the user wants to see details of a specific public resource:
   - For datasets/models: use `dataset/dataset-read-detail.graphql` for metadata, then `dataset/dataset-readme.graphql` for content.
   - For tutorials: use `compute/job-readme.graphql` for the README or `compute/job-jupyter.graphql` for notebook content.
2. Summarize the content in a user-friendly format.

**README 里的配图**（`jobReadMe` / `datasetReadMe` 返回的是渲染后的 **HTML**，不是 markdown）：图片是 `storages/content?key=…&token=…` 形式的签名外链，token 已内嵌、无需额外鉴权，但有两个坑：

- **先把 HTML 实体还原**（`&amp;` → `&`）再下载。不还原会把 `token` 参数截断，请求必然失败。
- **GIF 抽一帧再看**，别把整个文件塞给模型：教程动图动辄十几 MB，`sips -s format png <in>.gif --out <out>.png` 抽出的首帧通常只有几百 KB，信息量一样。附带好处是尾部不完整的 GIF 照样能抽帧，不必为此排查。

用户问"教程里的图是什么"时才下载；只做内容总结时读 HTML 文本即可。
3. Surface next actions:
   - datasets/models: mount as a `dataBinding` when creating or restarting a job (see `compute/create-job.md`)
   - models (`Dataset.Category = MODEL`): can also be one-click deployed as a serving (gated by `canBindJob`)
   - tutorials: clone into own account (see `references/workflows/compute/clone-tutorial.md`)

## Category Semantics

- `DATASET` — traditional datasets (images, text corpora, CSV, etc.)
- `MODEL` — model weights and checkpoints
- `ALL` — no category filter

When the user says "模型" or "model", search with `category: [MODEL]`. The schema also defines `PRETRAINED_MODEL` and `CODE`, but they are not in active use — do not surface them to the user or use them as fallbacks.

## Frontend URLs

用户要「入口」/「链接」/「打开看看」时，给出的 console URL **一律逐字引用查询结果里 `links` 中 `name == "frontend"` 的 `value`**。本 workflow 的 search / detail 查询（`dataset-search-public`、`project-search-public`、`dataset-read-detail`）都已 select `links { name value }` —— 引用它，不要自己拼。

Console 的真实路由不能从资源类型猜出来：教程（Project）在 `/console/{owner}/containers/{id}` 下，**不是** `/projects/{id}`——手拼的路径会 404。If a result unexpectedly has no `links` (older query file, partial data), re-fetch it with a query that selects `links`, or answer without a URL and say so explicitly — a fabricated URL is worse than none.

## Public Listing Semantics

Permission and listing are different layers:

- Permission layer: `permissions.publicPermission` (e.g., `PUBLIC_READ`).
- Page listing layer: public resource pages filter on `tagNames: ["public"]`.

A resource with `PUBLIC_READ` is accessible to anyone, but it only appears on the public pages if it also carries the `public` tag. To match what the user sees in the product UI, always pass `tagNames: ["public"]`. Drop it only when the user explicitly asks for "all public-readable resources" rather than the curated public pages.

## Storage

When recommending public resources, note that read-only binding does not consume personal storage. For full rules see `references/workflows/common/storage-semantics.md`.

## Guardrails

- All operations in this workflow are read-only; no confirmation required.
- Do not mix resource types into one ambiguous list — always group by type.
- README and Jupyter content may be null for some resources; handle gracefully.
- Console URLs are quoted from `links[name == "frontend"]`, never hand-assembled from `owner.id` + resource id (see Frontend URLs).

## Related Workflows

- Clone a public tutorial: `references/workflows/compute/clone-tutorial.md`
- Create a workspace with public dataset bindings: `references/workflows/compute/create-workspace.md`

## GraphQL Operations

- `references/graphql-operations/dataset/dataset-search-public.graphql`
- `references/graphql-operations/compute/project-search-public.graphql`
- `references/graphql-operations/dataset/dataset-read-detail.graphql`
- `references/graphql-operations/dataset/dataset-readme.graphql`
- `references/graphql-operations/compute/job-readme.graphql`
- `references/graphql-operations/compute/job-jupyter.graphql`

## Related Docs

- Concept overview (user-facing, three types): `references/openbayes-docs/open-resources/index.md`
- Public-resource FAQ: `references/openbayes-docs/open-resources/faq.md`

## Examples

### Broad Ask — Clarify First

User request:

> 看看目前有什么公共资源哦

Good handling (broad, no type named → disambiguate, don't dump all three):

> OpenBayes 的公共资源分三类：**公共数据集**（如 PASCAL_VOC，只读绑定不占存储）、**公共模型**（预训练权重，可绑定或一键部署）、**公共教程**（可克隆即跑的示例项目）。想先看哪一类？有关键词也一起说，我帮你检索筛选。

Bad handling (what to avoid):

> ❌ Looking for a GraphQL script in the container, failing to find it, and replying "我这边拿不到实时公共资源列表" with only a static table. Public browsing is a plain read query — run it, or state the real blocker; do not present the doc table as the final answer.

### Browse Public Models

User request:

> 帮我看看平台上有哪些公开的模型可以用？

Good handling:

> I will search public resources with `category: [MODEL]` and `tagNames: ["public"]` to find available models, then list them with name, owner, and binding info so you can select one for your job.

### Inspect a Public Dataset

User request:

> 我想看看 PASCAL_VOC 这个公开数据集的介绍

Good handling:

> I will first search public datasets by keyword `PASCAL_VOC`, then load the dataset detail and README content to show you the full description.

### Find Tutorials About a Topic

User request:

> 有没有关于 stable diffusion 的公开教程？

Good handling:

> I will search public tutorials (projects) by keyword `stable diffusion` and list matching results with their descriptions and job counts.
