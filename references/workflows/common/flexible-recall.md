# 灵活关键词召回（flexible-recall）

当用户问的是"**有没有 / 是不是做过 / 找一下跟 X 有关的**"这类**召回 / 存在性**问题时，一次字面关键词 `q` 查空就回"没有"是最常见的假阴性来源。本文件规定这类问题的检索纪律。

这是"别信 naive query"家族的一员，和 `references/graphql-discipline.md` 的「分页排序陷阱」并列：那条管的是**排序维度**的漏查（page 1 ≠ 不存在），这条管的是**匹配维度**的漏查（关键词查空 ≠ 不存在）。

## 何时适用

| 提问形态 | 是否走本纪律 |
|---|---|
| 「我最近有没有做 opencode 相关的东西」「之前是不是搞过 X」「找找跟 Y 有关的 job/数据集/项目」 | ✅ 召回问题，走本纪律 |
| 「列出我在跑的 job」「我所有的数据集」——纯列举，无主题关键词 | ❌ 不注入 `q`，走原 list workflow |
| 已知 ID / 名字精确查某一个对象 | ❌ 直接按 ID/名字读 |

判据：**自由文本主题词 + 召回/存在性框架**。只要用户在问"有没有 / 找一下某个主题"，就是召回。

对**不点明实体类型**的通用召回（"做 X 相关的东西"，X 可能是 job / 数据集 / 项目 / 服务），默认按下面「实体扇出顺序」逐类查，别只搜一类就下结论。

## 为什么单次 `q` 会漏

服务端 `q` 是**字面匹配**。`"opencode"` 匹配不到 `"test-open-code"`：连字符把它拆成 `test` / `open` / `code`，还多了 `test-` 前缀。同类漏法：

- 分隔符：`opencode` vs `open-code` / `open_code` / `open code`
- 词缀：`test-open-code`、`opencode-v2`、`my-opencode-demo`
- 大小写 / 驼峰：`OpenCode` / `openCode`
- 别名 / 缩写：`sd` vs `stable diffusion`、`yolo` vs `yolov8`
- **跨语言（中↔英）**：`通义千问` vs `Qwen`——中文品牌名和英文/罗马收录名常一个字符都不重叠，是模型检索的头号假阴性。见下「跨语言别名」。

一次 brittle query = 一次假阴性。**不要**据此回"没有"。

## 跨语言别名（中↔英）

平台目录（尤其模型）多用**英文/罗马名**收录，用户却常用中文品牌名问。中文字面 `q` 往往只命中"带中文前缀的子集"甚至 0 条——例如公共模型里 `通义千问` 8 条 vs `Qwen` 35 条、`深度求索` 0 条 vs `DeepSeek` 12 条。

**所以查中文 AI 品牌/产品名时，同时用英文/罗马名查、并以英文名为主**（通常是超集）。用你自己的常识翻译品牌名（`通义千问→Qwen`、`深度求索→DeepSeek`…），**别硬编码词典**（同 `sd↔stable diffusion` 一路）。中文名查到几条**不是**停止信号——这是「命中即停」的例外。反向（用户已给英文名）一般无需再查中文。

## 分档升级配方

**核心原则——命中即停 ≠ 查空即停**：一旦拿到足够回答用户的结果就停手，别再加查；但"某个变体 / 某类实体查空"只是这一格的 miss，**不是**停止信号——要把该格的变体查完、该轮的实体扇完，才算排除。

**第 1 档 · 原词直查** —— 用用户的原词查一次。命中且足够 → 直接呈现，结束。

**第 2 档 · 变体扩展 + 实体扇出**（第 1 档稀疏 / 空时）

先对原词生成 ≤3 个最可能的变体：

- 分隔符拆/合：`opencode` → `open-code`、`open code`、`open_code`；反向 `open code` → `opencode`
- 核心 token 单独查：取最具区分度的一段（`opencode` → `open`），它能命中 `test-open-code` / `opencode-v2` 这类带词缀的
- 明显别名/缩写 + 跨语言：自行判断（`sd` ↔ `stable diffusion`、中文品牌名→英文名 `通义千问`→`Qwen`），别硬编码词典——见「跨语言别名」

**变体按区分度逐个查**（核心 token 优先），某个变体命中就停、呈现该结果；**全部 ≤3 个变体查遍仍空**，这类实体才算 miss。

**实体扇出顺序**：用户没点明类型时，按下序逐类查，**命中即停、查空再下一类**；用户点了类型（"项目" / "我部署的服务"）就从那类起：

```
jobs (list-jobs.md) → datasets (search-datasets.md) → projects (内联) → servings (内联)
```

```bash
# 示意：变体逐个查 jobs，命中即停（已拿到足够结果就别再跑后面的变体/实体）
# `modes` 与 compute/list-jobs.md 同规则：默认白名单，用户点名某类 mode（含 SANDBOX）时改传那一类
for q in "open" "open-code" "opencode"; do   # 核心 token 优先
  if ! out=$(bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes \
    --query 'query($u:ID!,$q:String!){ party(id:$u){ jobs(q:$q,status:[ALL],modes:[WORKSPACE,TASK]){ data{ id name mode } } } }' \
    --vars-json "{\"u\":\"<username>\",\"q\":\"$q\"}"); then
    # 调用本身失败（如该部署还没有 `modes` 参数）≠ 没找到：如实报告并停止，
    # 别接着试别的变体、更别退回不带 `modes` 的查询
    break
  fi
  echo "$out"
  # 命中即停：这个变体已拿到结果就 break，别再跑后面的变体
  # `modes` 白名单把 SANDBOX 挡在服务端（见 compute/list-jobs.md），所以这里直接判空即可。
  # stdout 已是 data 对象，无 .data 包裹
  [ "$(echo "$out" | jq '.party.jobs.data | length')" -gt 0 ] && break
done
```

**第 3 档 · 放宽 + 语义筛**（第 2 档**所有相关实体都查遍仍为空**时）—— 丢掉 `q`（或只留一个泛化 token），逐类拉近期窗口，然后**你自己按"名字 + 描述"的含义去匹配用户意图**。

**翻页硬上限**：每类实体最多拉 3 页（≈90 条），聚合后再语义筛；遵守 `list-jobs.md` 的分页与 `graphql-discipline.md` 的分页排序纪律（别只看 page 1）。3 页仍无相关结果，就向用户说明**已检索的范围 + 建议缩窄关键词**，**不要继续翻页**——`list-jobs.md` 的 >10 页是"警告"不是硬停，这里给它一个硬停。

> 这一步是 mastracode「语义召回」的平替：mastracode 用向量库 + embedding 做 semantic recall；这里没有向量索引，但**你（LLM）本身就是语义匹配器**——`test-open-code` 在近期列表里对你显然与 `opencode` 相关。

**呈现**：命中后分组列出，给出"为何判定相关"的一句话理由 + console URL（按 `references/ui-links.md`）。

## 扇出目标：召回可能落在哪些个人实体

"做 X 相关的东西"往往不止一类资源。已有 workflow 的优先；projects / servings 没有按主题检索的 workflow，临时内联即可：

| 实体 | 入口 | 关键词检索 |
|---|---|---|
| Jobs / workspaces | `references/workflows/compute/list-jobs.md`（workflow） | `Party.jobs(q:)` |
| Datasets / models | `references/workflows/dataset/search-datasets.md`（workflow） | `Party.datasets(q:)` |
| 公共 datasets/models/tutorials | `references/workflows/common/explore-public-resources.md`（workflow） | `publicDatasets(q:)` / `publicProjects(q:)` |
| **Projects** | 暂无 workflow → **内联查询** | `Party.projects(q:)` |
| **Servings** | 列举见 `references/graphql-operations/serving/serving-list.graphql`；按主题召回 → **内联查询** | `Party.servings(q:)` |

jobs / datasets / 公共资源走各自 workflow。projects / servings 按 `references/graphql-discipline.md` 的 inline-query 约定临时内联，不需要新建模板：

```bash
# 内联搜个人 projects（hit/miss 只取 id+name；第 3 档要语义筛再加 description）
bash <skill-dir>/scripts/run_graphql.sh --vendor openbayes \
  --query 'query($u:ID!,$q:String!){ party(id:$u){ projects(q:$q){ data{ id name } pageInfo{ total } } } }' \
  --vars-json '{"u":"<username>","q":"open"}'
# servings 同形：party(id:$u){ servings(q:$q){ data{ id name } } }
```

`test-open-code` 若是一个 **Project 实体**而非 job，只有扇到 projects 这一格（或第 3 档放宽拉 projects 列表再语义筛）才能命中。

## 反模式

- ❌ 单次 `q="opencode"` 查空 → 回"你没做过 opencode 相关的东西"。漏了 `test-open-code`。
- ❌ 某个变体查空就判这类实体 miss——要 ≤3 个变体都查遍才算。
- ❌ 第 1 档原词已命中，还机械把所有变体、所有实体全打一遍——浪费往返。
- ❌ 只搜一类实体（如只搜 jobs）就下结论——通用召回该按 jobs → datasets → projects → servings 扇出，命中即停。
- ❌ 把空结果当 ground truth，不放宽、不语义筛、也不告诉用户试过哪些形式。
- ❌ 第 3 档无界翻页 / 只看 page 1——每类 ≤3 页，到顶就停并告知范围；见分页排序陷阱。

## 实例：「我最近有没有做 opencode 相关的东西」

1. **第 1 档**：`jobs(q:"opencode")` → 空。**不**回"没有"。
2. **第 2 档 · 变体**：jobs 试核心 token `open`（再退 `open-code`）。命中 workspace `test-open-code` → 呈现、结束。
3. **第 2 档 · 扇出**：若 jobs 三个变体都空 → 同法查 datasets（`search-datasets.md`）；仍空 → 内联 `projects(q:"open")`，命中 Project `test-open-code`。
4. **第 3 档**：上面都空才放宽——逐类拉近期列表（每类 ≤3 页），在里面语义认出 `test-open-code` 与 opencode 相关。
5. **呈现**：「用 `opencode` / `open-code` / `open` 在 job、数据集、项目里都查过；找到一个项目 `test-open-code`（创建于…），看名字应该就是你说的 opencode 相关的东西。要展开看里面的 job 吗？」

## Related

- `references/graphql-discipline.md` →「分页排序陷阱」（同属"别信 naive query"；第 3 档放宽时必须遵守，翻页有界）
- `references/workflows/compute/list-jobs.md`、`references/workflows/dataset/search-datasets.md`、`references/workflows/common/explore-public-resources.md`
