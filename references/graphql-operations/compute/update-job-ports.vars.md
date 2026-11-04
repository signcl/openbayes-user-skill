---
tier: confirm
title: 修改端口暴露
effect: 容器对外暴露的端口立即变化，原访问地址可能失效
subject: jobId
highlight: [ports]
---

# update-job-ports.vars.md

`updateJobPorts(userId, jobId, ports: [PortInput!]!)` declares which container
ports a job exposes. The platform then mints the public access URLs and returns
them on `Job.links[]` (read them back — see below).

## The name field is `name` on both sides (it used to differ)

Input and output now agree — send `name`, read back `name`:

```graphql
input PortInput {           # what you SEND
  name: String              # ← the mapping name goes HERE
  port: Int!
}

type JobPort {              # what you READ BACK
  id: Int
  jobId: String
  name: String              # ← same value, same field name
  port: Int!
  createdAt: UTCDateTime
}
```

So copying the response shape (`ports { name port }`) into the variables is now
the *correct* move.

**This is a rename.** The input field used to be `customizedName`, and the
asymmetry was documented here as the single most common reason an agent looped
on `updateJobPorts`. Measured 2026-08-15 against beta: `PortInput` exposes
exactly `name` and `port` — `customizedName` is **gone**, so sending it now
fails validation, the exact mirror of the old trap.

Beta is the reference. Production disables GraphQL introspection **by design**,
so "confirmed on beta" is the strongest form this claim takes here — that is the
normal state, not a gap to be closed later.

`name` is **optional**. Omit it to get a port-number-based URL; set it for a
stable, human-friendly subdomain (see URL forms below).

## `updateJobPorts` replaces the entire port set

The `ports` array is the **complete desired set**, not a delta. The platform
sets the job's custom mappings to exactly what you send:

- To add a mapping, read the current ports first (`load-job-context.graphql`),
  then submit `current + new`.
- Omitting a previously-mapped port **removes** it.
- Submitting `[]` clears all custom mappings.

## Port `8080` is the default `auxiliary` slot (reserved)

`8080` is exposed **by default**, independent of the `ports` array, and reachable
at the job's single `auxiliary` link in jobid form (`https://{user}-{jobid}.{domain}`
— e.g. `https://zhangsan-m4kd7pq2xr9v.gear-c1.openbayes.net/`). It is a reserved
port, **not** a mapping target: never put `8080` in the `ports` array. The
named-subdomain forms below apply to **non-8080** ports only.

## URL forms for non-8080 custom ports

After `updateJobPorts`, each non-8080 mapping surfaces as its own `Job.links[]`
entry whose shape depends on whether `name` was set:

| `name` | Public URL form | Example |
|---|---|---|
| set (e.g. `"vllm"`) | `https://{user}-{name}.{domain}` | `https://zhangsan-vllm.gear-c1.openbayes.net` |
| omitted | `https://{user}-{jobid}-{port}.{domain}` | `https://zhangsan-m4kd7pq2xr9v-7860.gear-c1.openbayes.net` |

Prefer setting `name` — stable and readable. Leave it off only when an
automation just needs *some* URL and naming is not worth surfacing.

## Constraints

- **Reserved ports** (cannot be mapped): `22, 80, 4545, 5901, 6006, 6637, 7088, 8200, 8300, 8888` (platform-internal services), plus `8080` (the default auxiliary slot).
- **Max 5** custom mappings per container.
- The served app must bind `0.0.0.0` (not `127.0.0.1` / `localhost`), or the URL
  resolves to nothing.
- Mapping names must be unique within a container (duplicate `name` errors out).
- Requires real-name verification (实名认证) on the account.

## vars.json — add a named mapping for a Gradio app on 7860

Read current ports first, then send the full set (`ports` is a full replacement — any existing mapping you omit is removed; this job has none):

```json
{
  "userId": "<owner-username>",
  "jobId": "<jobId>",
  "ports": [
    { "name": "gradio", "port": 7860 }
  ]
}
```

## vars.json — expose a vLLM OpenAI-compatible server, keep an existing mapping

```json
{
  "userId": "<owner-username>",
  "jobId": "<jobId>",
  "ports": [
    { "name": "gradio", "port": 7860 },
    { "name": "vllm", "port": 8000 }
  ]
}
```

## Response / read-back

`updateJobPorts` returns the `Job` with `ports { name port }` (the **declared**
mappings, `JobPort` shape). The **access URLs are NOT on this response** — they
live on `Job.links[]`, built by the server once the endpoint is provisioned.
After mutating:

1. Read back with `load-job-context.graphql`.
2. Take the URL from `links[]` — `auxiliary` for the 8080 app, or the
   `{user}-{name}` / `{user}-{jobid}-{port}` entry for a custom port.
3. **Never hand-build the URL** from the pieces — the server owns construction
   (domain, cluster segment, scheme). Use the readback `links` as source of
   truth.

Extra port URLs appear only when the job is `RUNNING` and provisioning is
complete; on a non-running or still-provisioning job, expect them to be absent
(not an error).

To hand the user the URL to *open* a running service, route through
`references/workflows/compute/access-job-service.md`.
