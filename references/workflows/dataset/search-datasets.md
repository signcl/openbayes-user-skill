# Search Datasets

Use this workflow when the user wants to find datasets for binding preparation or general browsing.

## Goal

Run keyword retrieval across owned, party, and/or public scopes, returning results grouped by source.

## Intent to Query Mapping

- `dataset.search.public` -> `publicDatasetsQuery` (`dataset/dataset-search-public.graphql`)
- `dataset.search.owned` -> `partyDatasetsModelsQuery` (`dataset/dataset-search-owned.graphql`)
- `dataset.search.party` -> `partyDatasetsModelsQuery` (`dataset/dataset-search-party.graphql`)
- `dataset.search.all` -> run `owned + public` and return grouped by source (`dataset/dataset-search-all.graphql`)

## Category Filtering

Use the `category` parameter to narrow results by resource type:

- `DATASET` — traditional datasets (images, text, CSV, etc.)
- `MODEL` — model weights and checkpoints
- `ALL` — no category filter (default)

When the user asks for "模型" or "model", use `category: [MODEL]`. The schema also defines `PRETRAINED_MODEL` and `CODE`, but they are no longer in active use — do not surface them or use as fallbacks.

For broader public resource exploration (including tutorials), see `references/workflows/common/explore-public-resources.md`.

## 大小字段

`Dataset.size` 是数据集总大小;`versions[].size` 是单个版本的大小。比较数据集大小用 `Dataset.size`。

## Deterministic Steps

1. Classify the search scope: `owned`, `party`, `public`, or `all`.
2. Run keyword retrieval with `q` (allow empty string for browsing). 对模糊召回（"有没有 X 相关的数据集 / 模型"）别只查一次原词——按 `references/workflows/common/flexible-recall.md` 做变体扩展与放宽语义筛。**另（不论是否模糊召回，含精确找某个模型）：搜中文 AI 模型/品牌名（如 `通义千问`）即使查到结果也要再用英文名（`Qwen`）查一遍并合并**——目录多用英文名收录，中文名常只命中子集甚至 0 条；见 flexible-recall「跨语言别名」。
3. Include `category` and `page` parameters.
4. For the `public` scope, default `tagNames: ["public"]` so results match the public page in the product UI; drop only when the user explicitly wants every `PUBLIC_READ` resource.
5. Read total hit count from `pageInfo.total` (filtered count, not page size).
6. Return candidates grouped by source (`owned`, `party`, `public`).
7. Prefer candidates with clear version binding identifiers (e.g., semantic binding name).
8. When preparing bindings for job/serving, prefer readonly mounted paths for large model artifacts.
9. When presenting public candidates, note the storage advantage per `references/workflows/common/storage-semantics.md`.

## Public Listing Semantics

Permission and listing are different layers:

- Permission layer: `permissions.publicPermission` (e.g., `PUBLIC_READ`).
- Page listing layer: public pages filter on `tagNames: ["public"]`.

`PUBLIC_READ` means accessible; appearing on the public page additionally requires the `public` tag. Default to `tagNames: ["public"]` to match the UI; omit it only when the user explicitly asks for all public-readable resources.

## Tag Filtering Boundary

Follow the native and bounded-fallback rules in `references/concepts/resource-tags.md`.

## Guardrails

- Search is read-only; no confirmation required.
- Do not mix visibility scopes into one ambiguous list — always group by source.
- When summarizing entries, include the console URL per `references/ui-links.md`.

## GraphQL Operations

- `references/graphql-operations/dataset/dataset-search-public.graphql`
- `references/graphql-operations/dataset/dataset-search-owned.graphql`
- `references/graphql-operations/dataset/dataset-search-party.graphql`
- `references/graphql-operations/dataset/dataset-search-all.graphql`
