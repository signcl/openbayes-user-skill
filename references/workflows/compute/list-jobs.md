# List My Jobs

Use this workflow when the user wants a listing of their own jobs — typical phrasings: "我的 job", "what's running", "show my workspaces", "最近失败的任务".

Do not use this workflow to inspect a single job; drill into `references/workflows/compute/inspect-job.md` instead.

## Goal

Return a paged listing of jobs owned by the current user (or the current org context) with enough metadata for the user to recognize each entry and decide what to drill into.

## Scope

- Covers both personal listings (`$username = me.username`) and org listings (`$username = <org slug>`). `party(id)` resolves both via the `Party` interface.
- Read-only. No mutation, no side effects.

## Prechecks

1. Run bootstrap if not already done this session (see `references/workflows/common/bootstrap.md`) to obtain `me.username`.
2. If the user specifies an org context (e.g., "show <org>'s jobs"), substitute that org slug for `$username`; `party(id)` accepts either.

## Status Recipes

| User intent | `status` argument |
| --- | --- |
| 正在运行 / active / "什么在跑" | `[RUNNING, CREATED, QUEUED, CANCELLING]` |
| 全部 / 最近的 job / 历史 | `[ALL]` (default) |
| 失败的 / failed | `[FAILED]` |
| 已完成 / finished | `[SUCCEEDED]` |
| 已取消 | `[CANCELLED]` |

Valid `JobStatusInput` values (see `references/graphql/schema.graphql`): `QUEUED`, `CREATED`, `RUNNING`, `SUCCEEDED`, `CANCELLED`, `FAILED`, `CANCELLING`, `ALL`.

## SANDBOX jobs are hidden by default（Agent 基础设施）

`mode == SANDBOX` jobs are platform-run Agent infrastructure, not user workloads. They stay out of user-facing listings, counts and links, and the server does the excluding:

- **`load-my-jobs.graphql` filters server-side.** `Party.jobs` takes `modes: [JobModeInput!]`（多选，语义是「只要这些」，没有排除式写法）, and the operation defaults `$modes` to `[WORKSPACE, TASK]` —— 平台只支持这两种（见 `SKILL.md` → "Compute Create Routing"），其余 mode 不在名单里就不会返回，`pageInfo` 也是过滤后的，所以不需要客户端剔除，也不会出现整页被过滤空。任务总个数读取当前筛选条件下的 `pageInfo.total`，字段含义与翻页终止条件见下文 Pagination。
- **`$modes` comes from the request.** 普通列举用默认白名单；用户点名某一类就传那一类——包括 sandbox，以及白名单挡掉的那些不受支持的 mode。实测 2026-08-25：`VIRTUAL_MACHINE`、`WORKSPACE_SNAPSHOT`、`BATCH_TASK`、`BATCH_WORKSPACE` 单独查都是 0 条。
- **`Unknown argument "modes"` 说明这个部署还没升级到带该参数的 api-server。** 如实告诉用户这个能力在当前环境还不可用，不要重试，也不要退回去自己拉全量再筛——那条路已经删了。
- **Counts use the filtered job list.** 用 `party.jobs` 的 `pageInfo.total` 回答当前服务端筛选条件下的总个数；若还需客户端语义筛选，翻完再数匹配条目。不要用 `Project.runningJobCount` 回答，它是否包含 SANDBOX 尚未验证。
- **Never mention the filtering** or volunteer what sandbox is. If nothing matched, answer "no jobs match the filter" — 不解释某些条目为什么不在里面。
- **Exceptions** (authoritative list; other files point here): the user explicitly asks about sandbox or supplies a SANDBOX job id — answer truthfully, do not deny their existence. Likewise when a missing `links.sandbox` is the stated reason an action is refused or held to read-only — a required reason is not volunteering.
- The `party.projects → latestJob / jobs` recall path (below) has no `modes` of its own: `project.jobs` 的 `mode` 是单值「只要这一种」，排除不了，所以那条路仍然跳过 SANDBOX 的 `latestJob`、自己筛 `project.jobs` 的结果。
- bootstrap 的 `whoami.graphql` 是三个包共用的操作，没有 `modes`，它返回的 `jobs` 同样自己剔除后再用。

## Pagination

`party.jobs` is page-based (not cursor-based):

- `page` starts at `1`.
- `pageInfo.current` 是当前页码。
- **`pageInfo.total` 是当前筛选条件下的任务总个数，不是总页数，也不是本页条数。** 本页条数读取 `data.length`；总页数按 `Math.ceil(total / 30)` 计算。
- `pageInfo.next`/`prev` 是相邻页的页码，`0` 表示没有相邻页，不是布尔值。`pageInfo.next > 0` 时，将返回的页码作为下一次的 `page`；`next == 0` 时停止。
- 每页最多 30 条；`Party.jobs` 不接受 `perPage` 参数。

例如：第 1 页返回 30 条、`total: 35, next: 2`；第 2 页返回 5 条、`total: 35, next: 0`。应报告「共 35 个任务，分 2 页」，只展示第 1 页时写「共 35 个，本次显示 30 个」。空列表 `total: 0, next: 0` 报告「0 个任务」。

用户要求全部任务时按 `next` 翻到末页；预计超过 10 页（`total > 300`）时先说明总个数和预计页数，再询问是否继续。只问个数且不需客户端筛选时，直接报告 `total`，无需为计数拉全量。所有分页列表的通用字段含义与计数规则见 `references/graphql-discipline.md` →「分页字段与计数」；每页条数按各接口取值。

### `party.jobs` is a status filter; "recently active/stopped" goes through Project

`party.jobs` / `project.jobs` are status filters — only filter args, **no `sort`/`orderBy`** (results come back `createdAt` DESC). `party`/`user`/`org`.jobs take `status` + `q` (keyword) + `labelKeys`; `project.jobs` takes `status` + `mode` + `labelKeys` (plus `userId`/`projectId`/`perPage`). Primary uses: "what's running / failed / stopped".

#### "最近停掉的 / 最近活动的" — go through Project, not `party.jobs`

For "recently stopped / recently active" intent, **list `party.projects` and use its ordering — not `party.jobs`**: `party.projects` comes back ordered by **`lastJobActiveAt` DESC** (last-active time), so a project whose job just ran or stopped floats to the top. Read each project's `latestJob` (or drill into its `jobs`). `Project` carries `lastJobActiveAt`, `latestJob`, `runningJobCount`, `workspaceCount` precisely to support this.

**Anti-pattern — do NOT do this:** fetch `party.jobs` page 1 (createdAt order) and re-sort by `endAt`. That sorts the most-recently-**created** jobs by `endAt` — a wrong subset; a job created months ago that stopped yesterday sits on a later page and is missed entirely. Go through projects instead.

See `references/graphql-discipline.md` → "分页排序陷阱" for the cross-relation sort discipline (jobs / deposits / servings all behave differently).

### Anti-patterns

- ❌ Calling `load-my-jobs.graphql` page 1 with `status: [CANCELLED]`, then sorting the 30 results by `endAt` and presenting them as "the most recently stopped". You sorted the 30 most-recently-**created** cancelled jobs by endAt — not the same thing.
- ❌ Treating `pageInfo.total = 210` as proof that page 1 holds the most relevant entries. 它表示当前服务端筛选条件下共 210 个任务，不代表目标时间窗内的条数或最近活动排序。
- ❌ Reporting "no recent stops in the last 3 days" after only inspecting `party.jobs` page 1. Page 1 is the most-recently-**created** jobs, not the most-recently-stopped — go through `party.projects` (ordered by `lastJobActiveAt`) to surface recent activity instead.

## Deterministic Steps

1. Normalize the request into `job.list.own`.
2. Choose `$status` from the Status Recipes table above based on the user's phrasing.
3. Call `load-my-jobs.graphql` with `$username` from bootstrap (or an explicit org slug), `$page = 1`, and the chosen `$status`. Leave `$modes` at its default for an ordinary listing; pass the named mode when the user asked for one kind.
4. The exclusion never surfaces in the answer: describe only the jobs you are showing — no "已排除/已过滤" 旁白，也不要给这批结果加「非内部」「非 sandbox」这类限定词，就叫它们「你的 job」。For each job, summarize:
   - id + name + mode
   - status + subStatus
   - resource (verboseName preferred) + runtime (framework/version)
   - project name
   - createdAt (and startedAt / endAt when relevant to the filter)
5. 汇报时区分总个数与已展示条数。用户要求全部或需要客户端筛选计数时，按 Pagination 的 `next` 页码翻页；仅需服务端筛选总个数时读取 `total` 即可。
6. Offer a drill-down: "Would you like me to inspect one of these?" → `inspect-job.md`.

## Guardrails

- Do not drop to a global admin job view when the user asks for "my jobs". This skill is user-scoped.
- Do not silently swallow an empty result — tell the user explicitly "no jobs match the filter" and restate which status set was queried.
- For a plain listing ("我的 job", no topic keyword), keep `q` at the default `""` — do not inject keywords. But for a **recall / existence** question ("我最近有没有做 X 相关的"), `q` is the whole point: follow `references/workflows/common/flexible-recall.md` (variant expansion + broaden-then-semantic-filter; an empty keyword result ≠ doesn't exist).
- When listing an org's jobs, remind the user that results include jobs created by other org members, not only the caller.
- When summarizing entries, include the console URL per `references/ui-links.md`.

## GraphQL Operations

- `references/graphql-operations/compute/load-my-jobs.graphql` — list party (user or org) jobs, filtered by `status`, paged by `page`. `$username` comes from bootstrap (`me.username`) or is provided as an org slug.

For per-job detail, use `references/graphql-operations/compute/load-job-context.graphql` via `inspect-job.md`.
