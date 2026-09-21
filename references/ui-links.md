# UI Link Surfacing Rule

Every `Job`, `Serving`, `Dataset`, and `Project` returned by GraphQL carries a `links: [Link!]` field. The entry where `link.name == "frontend"` is the OpenBayes console URL for that entity — for example `https://openbayes.com/console/zhangsan/jobs/n8tb3wz6yh1c`.

When summarizing entities for the user — especially in list-type results where scanning raw JSON is tedious — include the `frontend` link inline next to each entity's id/name.

> 想把用户**导航**到列表 / 新建 / 设置等 section 页面（不是某个具体实体）时，那些 URL 没有 GraphQL `links.frontend`，改用 `references/console-navigation.md` 的路由表。

## Extract the URL

Given an entity object from a GraphQL response:

```js
entity.links.find(l => l.name === 'frontend')?.value
```

The server does the URL construction. Do not rebuild it client-side, do not guess the path format, do not strip or rewrite query strings.

## Presentation Expectation

Include the URL inline with each summarized entity. One compact line per entity is preferred over a separate "URLs" section.

**Good:**

```
- n8tb3wz6yh1c · demo-workspace · WORKSPACE · RUNNING
  https://openbayes.com/console/zhangsan/jobs/n8tb3wz6yh1c
```

**Bad (URL hidden in JSON):**

```text
Here are your jobs:
{ "id": "n8tb3wz6yh1c", "name": "demo-workspace", "links": [...] }
```

## Fallback

If the `frontend` entry is absent (for example, the entity has not yet been provisioned), omit the URL for that entity rather than inventing one. Do not substitute another link name (`workspace`, `tensorboard`, etc.) — those are runtime access endpoints, not the console view.

## Job Extra Links (Detail View)

For `Job` read-single responses (for example `load-job-context`), `links` may include additional runtime endpoints such as:

- `workspace` — JupyterLab page for the job. Requires manual password entry on the login screen.
- `notebook` — **deprecated alias for `workspace`** (same URL). Prefer `workspace`; do not present both.
- `workspace-with-password` — same JupyterLab page but with the password embedded in the URL, so the user lands directly in the notebook without typing it. **Prefer this when the user wants to open Jupyter.**

For workspace-mode jobs, once the job is `RUNNING`, the `Job.password` GraphQL field (a sibling of `links`, see `load-job-context`) holds a single secret that serves three purposes simultaneously:

1. The JupyterLab login password (entered on the `workspace` URL's login screen).
2. The `?token=...` value embedded in `workspace-with-password` and in any deep-link URL (see below).
3. The SSH password for connecting to the workspace.

Treat it as a sensitive credential: do not echo it unprompted, but it is the single source of truth — there is no separate Jupyter token vs. SSH password.
- `tensorboard`
- `auxiliary` — the **default `8080` app slot**: the public URL of whatever the user's own service serves on `8080` (Gradio/Streamlit/web UI/LLM API). Always `{user}-{jobid}` form (`https://zhangsan-m4kd7pq2xr9v.gear-c1.openbayes.net/`). This is the URL to hand the user when they ask "how do I open my demo" — see `references/workflows/compute/access-job-service.md`. A non-8080 mapped port surfaces as its own entry (`{user}-{name}` or `{user}-{jobid}-{port}`), not as `auxiliary`.
- `live` / `websocket`
- `direct-vnc` / `vnc`

These are useful operational URLs, but they do not replace `frontend` in list summaries.

Treat non-`frontend` links as runtime endpoints rather than stable console identifiers.
For handing the user a clickable service URL, see `references/workflows/compute/access-job-service.md`.
For port-mapping mechanics and status-dependent visibility (for example `auxiliary`, `port-<port>`, and `RUNNING` expectations), see:

- `references/workflows/compute/update-job-ports.md` (+ `update-job-ports.vars.md` for the `PortInput` shape)
- `references/workflows/compute/inspect-job.md`

When presenting a single job detail:

- still include `frontend` as the canonical console URL
- include extra links relevant to the user's immediate goal (for example `workspace`/`workspace-with-password`, `tensorboard`, `auxiliary`)
- if direct JupyterLab access is needed and `workspace-with-password` exists, prefer it because `workspace` may still require manual password input
- treat token-bearing links (for example `workspace-with-password`) as sensitive and avoid echoing full tokens unless the user explicitly asks

### Deep-linking to a specific file in JupyterLab

To send the user a link that opens directly on a specific notebook or file (instead of the JupyterLab launcher), construct:

```
<workspace-base>/lab/tree/<path-relative-to-notebook-dir>?token=<password>
```

where `<workspace-base>` is the URL portion of the `workspace` link (the part before the trailing `/` or `/lab`), and `<password>` is the token from `workspace-with-password`.

Path mapping rule:

- Jupyter's `notebook_dir` is **deployment-specific**:
  - OpenBayes → `/openbayes`
  - HyperAI → `/hyperai`
  In both cases it is the platform root, **not** the `home/` subdirectory. The working directory the user sees by default is `<root>/home/`.
- A filesystem path under the platform root becomes a URL path by stripping that root prefix.
- Example (OpenBayes): `/openbayes/home/yolo26_demo.ipynb` → `home/yolo26_demo.ipynb`.
- Example (HyperAI): `/hyperai/home/yolo26_demo.ipynb` → `home/yolo26_demo.ipynb`.

Worked example (OpenBayes, `base_url = /jobs/zhangsan/jobs/q2vf5nk8dm40`, token `<job.password>`):

```text
https://openbayes.com/jobs/zhangsan/jobs/q2vf5nk8dm40/lab/tree/home/yolo26_demo.ipynb?token=<job.password>
```

The `lab/tree/<rel>?token=` URL shape is identical on HyperAI; only the host, `base_url`, and the `notebook_dir` root used for path stripping differ.

## Serving Extra Links (Detail View)

For `Serving` read-single responses (for example `serving-read-overview`), `links` commonly include runtime endpoints:

- `http` — primary serving HTTP endpoint
- `llm` — present only when OpenBayes detected an OpenAI-compatible API on this serving (i.e. `/v1/models` responds). When present, its value points to the **same endpoint** as `http` — it is a capability flag, not a separate URL. Do not present it as a second/alternate endpoint.
- `livelog` — websocket live log stream endpoint

If `llm` link is present, treat the serving as an LLM serving. In that case, expect and prioritize LLM telemetry streams (`llmEvents`, `llmLatencyTraces`, `llmTTFTTraces`, `llmTotalTokenTraces`).

When presenting a single serving detail:

- include `frontend` only when it exists
- always include relevant runtime links (`http`, `llm`, `livelog`) when present
- treat these as runtime access/probe endpoints, not console navigation URLs

## Applicability

- List queries: `load-my-jobs`, `load-project-jobs`, `serving-list`, `load-dataset-list`, and the dataset-search variants — all select `links { name value }` for this reason.
- Read-single queries (e.g., `load-job-context`, `serving-read-overview`) also select `links`; the same rule applies when presenting the entity to the user.
- Mutation responses are out of scope — they are typically small and do not need a listing-style summary.
