# Call a Gradio App's API (fetch the real result, not just the URL)

Use this when the user has a running Gradio app and wants the agent to **call it
and return the result** (image / text / file) — not merely open its page. This is
the step *beyond* `access-job-service.md`: that workflow hands over the URL; this
one introspects the app's API and invokes it on the user's behalf.

Triggers: 「用这个 gradio 帮我生成 / 跑一下」「调用这个应用的 API」「把结果拿回来」
「这个 demo 的接口怎么调」 — any request to *use* a Gradio app's function, not just
visit it.

## The one rule

**Everything keys off `GET <url>/gradio_api/info`.** That endpoint is the app's
machine-readable contract — the same data the "view API" panel renders. Read it to
learn the endpoints, parameters, types, defaults, which params are required, which
are files, and what comes back; then map the user's intent onto it. Never hardcode
an app's endpoint names or params, and never assume a port.

## Deterministic steps

### 1. Resolve the app URL (the user's URL always wins; never assume 8080)

- **User gave a URL** → use it verbatim. Any shape works: the default 8080
  (`auxiliary`) URL, a custom port mapping (named or unnamed), an org-slug
  namespace, or even a non-OpenBayes Gradio (HF Spaces, an SSH tunnel to
  localhost). For the exact OpenBayes URL forms see `container-dev-quickref.md`
  → "Port Exposure".
- **User gave only a job ref** → load `links[]`
  (`compute/load-job-context.graphql`) and pick the link the app is bound to,
  reusing `access-job-service.md` (8080 → `auxiliary`; non-8080 → that port's
  link). Never hardcode `auxiliary`. If several service links exist, probe them in
  turn and take the first whose `/gradio_api/info` returns `named_endpoints`, or
  ask which port. For an **org** job
  the `{ns}` / `userId` is the **org slug**, not the username (see
  `container-dev-quickref.md` → 「从 console 容器 URL 拿到 job」).
- **Console container URL** (`/{ns}/containers/{id}`) → `{id}` is a projectId;
  resolve it to a job first (`container-dev-quickref.md`), same org-slug caveat.

Rule of thumb: whatever URL serves the app is the URL; detection is always
`GET <that-url>/gradio_api/info`.

### 2. Detect + discover the API

```bash
curl -s --max-time 25 <url>/gradio_api/info
```

- 200 + a `named_endpoints` object ⇒ it's Gradio. (Empty / 404 / no endpoints ⇒
  see Fallbacks.)
- Large responses: list endpoint names first, expand only the chosen one
  (keep the full JSON locally; never truncate before parsing).
- For each endpoint, `named_endpoints["/name"]` gives:
  - `parameters[]`: `parameter_name`, `parameter_has_default`, `parameter_default`,
    `type`/enum, `python_type`, `component`, `example_input`
  - `returns[]`: component + type (text vs image vs file output)
- **Required params = `parameter_has_default: false`.** Fill those plus whatever
  the user asked for; let the rest default. Do **not** copy the full "view API"
  snippet — that panel re-sends every optional param.
- **File inputs** = components like Image / Gallery / Audio / Video / File
  (`python_type` mentions `dict(path: ...)`). They need `handle_file()` (Python)
  or an upload (curl).

**Read the source when you need more than the contract.** Because it's the user's
own (or their org's) job, you can usually read the app code via sandbox/SSH
(`container-dev-quickref.md`); the launcher lives in `/output`
(`app.py` / `*_launch*.py` / a notebook ending in `demo.launch(...)`, per
`access-job-service.md`). Source gives what `/info` can't: a param's real meaning /
valid range / units, endpoints hidden with `api_name=False`, and — when the app set
`show_api=False` so `/info` is empty — the only way to reconstruct the interface
(read the `gr.Blocks` / `gr.Interface` and its `fn=` handlers).

Discovery order: `/info` first → read source when you need semantics, suspect
hidden endpoints, or `/info` is empty → only if both fail, fall back (see below).

### 3. Make `gradio_client` available — or skip it (environment-adaptive)

The only requirement is "a Python that can `import gradio_client`", or no Python at
all (curl). Pick the lightest path; **do not hardcode `uv`**.

- Already importable → use it, install nothing.
- **Local machine** (default — the URL is public) → `pip install gradio_client`,
  or for a throwaway env run the 4a snippet under
  `uv run --with gradio-client python - <<'PY' … PY` (only if `uv` is present;
  `--with` installs the client just for that run, nothing persisted).
- **Inside the container** (agent is in the workspace, or local egress is blocked)
  → it's just "install one package"; follow `container-dev-quickref.md` →
  "Dependency Installation" for the runtime's command. A one-shot call needs no
  persistence (`pip install gradio_client` / `uv pip install gradio-client`); use
  `pip install --user` only if it should survive a restart.
- Touch no Python → curl path (step 4b).

### 4a. Call via `gradio_client` (preferred when files are involved)

```python
from gradio_client import Client, handle_file
client = Client("<url>")                       # the app URL from step 1
result = client.predict(
    # required params from /info, plus whatever the user asked for; rest default
    prompt="...",
    # file inputs: wrap a local path OR a URL, e.g.
    # image=handle_file("/abs/path.png"),
    api_name="/generate",                      # the endpoint from /info
)
```

`client.predict` blocks on the queue and **downloads any result files to a local
temp path**. The return matches `returns[]` (often a tuple). File outputs appear as
e.g. `{"image": "<local temp path>", "caption": null}` — extract the path robustly
(search the structure for an existing path), then save it in the same script
(step 6) before reporting success.

### 4b. Call via curl (no deps; good for simple text in/out)

```bash
# positional data in the SAME order as parameters[] from /info
# 'generate' below = the endpoint's api_name from /info, with its leading slash dropped
EVENT=$(curl -s -X POST <url>/gradio_api/call/generate \
  -H 'Content-Type: application/json' \
  -d '{"data":["a prompt","", "..."]}' \
  | sed -n 's/.*"event_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')   # tolerant of spacing
[ -z "$EVENT" ] && { echo "failed to extract event_id — inspect the POST response" >&2; exit 1; }
# SSE stream interleaves generating/heartbeat/complete; the result is the data line
# that FOLLOWS 'event: complete' — not any earlier one. The server closes the stream after it.
curl -s -N "<url>/gradio_api/call/generate/$EVENT" \
  | grep -A1 '^event: complete' | sed -n 's/^data: //p'
```

- That final `data: [...]` array is the result; file outputs in it are URLs
  (`<url>/gradio_api/file=/...`) → download them. (Don't grab an earlier
  `generating`/`heartbeat` `data:` line — only the one after `event: complete`.)
- File **inputs** must be uploaded first: `POST <url>/gradio_api/upload`; then put
  the returned server path into `data` **wrapped as a FileData dict** —
  `{"path":"<uploaded-path>","meta":{"_type":"gradio.FileData"}}`, not a bare
  string. (This bookkeeping is why 4a is preferred when files are involved.)

### 5. Show the resolved call, then run

Validate values against `/info` enums/types first (e.g. a `resolution` argument must
be one of the documented `Literal[...]` values). Show the user the **resolved
api_name + final params** so a wrong value gets caught — a light confirm, not a hard
gate (they asked for the call; it consumes the running job's compute). Then execute.

### 6. Return the result — to the user's current working directory, with an absolute path

- File / image outputs → **copy from the temp path into the current working
  directory** with a meaningful name (from the prompt/endpoint), and report the
  **absolute path**. Copy and verify nonzero size in the calling script; for
  images, check the saved dimensions, not the requested ones. A temp path is
  not a delivered artifact. If copying fails, recover the existing download
  or server result before paying for another generation; process exit does
  not delete it.
- Text / JSON → print inline. Multiple artifacts → save all, list their paths.

## Fallbacks

- `/info` empty / no usable endpoint **and** source unreadable → fall back to
  `access-job-service.md` (hand over the URL) and say why (likely `show_api=False`,
  or the app requires auth).
- Job not `RUNNING` / still provisioning, or app bound to `127.0.0.1` / a wrong
  port → `/info` won't answer; route to `access-job-service.md` troubleshooting
  (it owns the bind / port-mapping fixes).
- Required file input but the user gave none → ask for the file or a URL.

## Guardrails

- The public URL is **unauthenticated** unless the app implements auth — calling it
  exposes whatever the app exposes. Say so when it serves a model or data.
- Take endpoint names + params from `/info` (or source); never hand-guess them.
- Never assume `auxiliary` / 8080; never hardcode `uv`.

## GraphQL Operations

- `references/graphql-operations/compute/load-job-context.graphql` (resolve a job
  ref → `links`)

## Related

- Just open the app's URL (don't call it): `access-job-service.md`
- Container access to read source / install deps:
  `references/workflows/common/container-dev-quickref.md`
- Port mappings (non-8080 apps): `references/workflows/compute/update-job-ports.md`
- Full URL semantics: `references/openbayes-docs/gear/expose-service.md`
