# Access a Job's Service (open the public URL)

Use this workflow when the user has a running job/workspace serving an HTTP app
and wants the **public URL to open it** — not to manage ports, not to inspect
state. Triggers: 「我跑起来了，怎么打开」「给我 demo 的网址」「这个 gradio/web UI 的链接」
「公网访问 / 外部访问 / 在线访问」「LLM API 地址」「auxiliary 链接是哪个」「demo 打不开 / 502 / 空白页」.

This is a **high-frequency, first-class scenario**: most OpenBayes tutorials are
*used* through this URL. Cloning a tutorial (Gradio text-to-image, Streamlit
dashboard, an OpenAI-compatible LLM server, a web UI) and running it produces a
service whose whole point is the link the user clicks. Lead with that URL — do
not bury it under a JSON dump or treat it as a footnote.

## The one rule that resolves most cases

**A served app on port `8080` is reached at the job's `auxiliary` link.** Port
`8080` is exposed by default — no port mapping required — and OpenBayes tutorials
commonly bind their demo to `0.0.0.0:8080`. So the answer is usually:

```text
the value of links[] where name == "auxiliary"
→ https://{user}-{jobid}.{domain}/        e.g. https://zhangsan-m4kd7pq2xr9v.gear-c1.openbayes.net/
```

That URL is always the `{user}-{jobid}` form. For an 8080 app the answer is
simply `links.auxiliary` — no `updateJobPorts` call, and do not promise a named
URL.

For any `auxiliary` 502 answer, explicitly state this first: `auxiliary` is the
user's default **8080 app slot**, not the sandbox agent. A 502 means the platform
can reach the slot but the user's app is not actually serving there yet (not
listening, bound to `127.0.0.1`, crashed, wrong port, or job not ready).

## Deterministic Steps

1. Resolve the `jobId`. If the user pasted a console **container** URL
   (`/{ns}/containers/{id}`), `{id}` is a **projectId**, not a jobId — resolve it
   first (see `references/workflows/common/container-dev-quickref.md`
   「从 console 容器 URL 拿到 job」).
2. Load `compute/load-job-context.graphql` (`userId`, `jobId`). You need
   `status`, `ports`, and `links`.
3. Pick the link by where the app is bound:
   - **App on `8080` (default / most tutorials)** → return `links` entry
     `name == "auxiliary"`. Done.
   - **App on a non-8080 port** → return the matching `links[]` entry for that
     port: `https://{user}-{name}.{domain}` if the mapping was named,
     else `https://{user}-{jobid}-{port}.{domain}`. If that port is not mapped
     yet, route to `references/workflows/compute/update-job-ports.md` to add it
     first, then read back `links`.
4. Hand back the **clickable URL on its own line**, labeled with what it serves.
   For an OpenAI-compatible server, give the usable form, e.g.
   `<auxiliary>/v1` (models at `<auxiliary>/v1/models`).
5. Take the URL **only** from readback `links` — never assemble it from
   `{user}`/`{jobid}`/`{domain}` by hand. The server owns construction (cluster
   segment, scheme, trailing slash).

## "It doesn't open" — troubleshooting (the `/output` launcher angle)

A present `auxiliary` link only means the slot exists; the app behind it may not
be answering. In order of likelihood:

1. **The app was never started.** The tutorial ships its demo + a launcher in
   `/output` (the workspace home), and *you have to run it* — cloning/restarting
   does not auto-launch most demos. Typical shape: a `*_launch*.py` / `app.py` /
   notebook cell that ends in `demo.launch(server_name="0.0.0.0",
   server_port=8080, ...)`, writing a `*launch*.log` next to it. Check the launch
   log / that the process is up (sandbox `fs/list` + `fs/read`, or SSH; see
   `container-dev-quickref.md`), and run the launcher if it isn't.
2. **Bound to `127.0.0.1`/`localhost` instead of `0.0.0.0`.** Then the mapping
   resolves to nothing. The app **must** bind `0.0.0.0`.
3. **Wrong port.** The app is on a port that is neither `8080` nor a mapped port.
   Either rebind it to `8080`, or map its port (`update-job-ports.md`).
4. **Job not `RUNNING` / still provisioning.** Extra/auxiliary URLs appear only
   when `status == RUNNING` and endpoint provisioning has completed.

## Do not confuse `auxiliary` with `sandbox`

`auxiliary` (8080) is the **user app slot**. `sandbox` is a **separate** link —
the platform's container-control agent (`<host>/jobs/{ns}/jobs/{jobId}/sandbox`).
Never probe `auxiliary` to detect the sandbox, and never offer the `sandbox` link
as the user's service URL. Keep reading `links.sandbox` internally to pick a
transport, but never list it when presenting links to the user (Agent
infrastructure; see `compute/list-jobs.md`). See `container-dev-quickref.md` →
"Sandbox HTTP API".

## Guardrails

- Lead with the URL; never make the user dig it out of JSON.
- Read the URL from `links`; do not hand-build it. For 8080, it is always
  `{user}-{jobid}` form regardless of any mapping `name`.
- A mapped-port URL exists only after the job is `RUNNING` and provisioned.
- **Security:** this URL is public and unauthenticated unless the app itself
  implements auth. Say so when the service exposes a model or data; suggest the
  app add auth rather than relying on URL obscurity.

## GraphQL Operations

- `references/graphql-operations/compute/load-job-context.graphql`
- `references/graphql-operations/compute/update-job-ports.graphql` (only when a non-8080 port must be mapped first)

## Related

- **Call** the app's API and fetch the result (not just open it):
  `references/workflows/compute/call-gradio-app.md`
- Add / change port mappings: `references/workflows/compute/update-job-ports.md`
  (+ `update-job-ports.vars.md` for the `PortInput` shape)
- Full URL semantics: `references/openbayes-docs/gear/expose-service.md`
- Container access (sandbox / SSH) to inspect or start the launcher:
  `references/workflows/common/container-dev-quickref.md`
- Link selection in general: `references/ui-links.md`
