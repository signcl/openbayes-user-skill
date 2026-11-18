# Update Job Ports

Use this workflow when the user wants to update a job's port mappings.

## Goal

Update the port declarations of an existing job using `updateJobPorts`.

## ⚠️ Read this before building the variables

The input/output shapes are asymmetric and `ports` is a full replacement — both
trip agents up. Full rules, URL forms, and worked `vars.json` live in
`references/graphql-operations/compute/update-job-ports.vars.md`. The essentials:

- **The name field is `name` on both sides.** Each item you send is a
  `PortInput { name?: String, port: Int! }`, and the mutation's *response*
  selects `ports { name port }` (a `JobPort`) — so copying the response shape
  into the variables is correct. Send `{ "name": "gradio", "port": 7860 }`.
  (The input field was `customizedName` until a 2026-08 rename; `vars.md` has
  the measurement.)
- **`ports` replaces the entire set**, not a delta. Read current ports first,
  then submit `current + new`. An omitted port is removed.
- **`8080` is the default `auxiliary` slot — a reserved port, not a mapping
  target.** An app on `8080` is reachable at `links.auxiliary` (`{user}-{jobid}`
  form) without any mapping; if the app can bind `8080`, **do not call
  `updateJobPorts` at all** (see
  `references/workflows/compute/access-job-service.md`).

## Deterministic Steps

1. Normalize the request into `job.update.ports`.
2. Require:
   - `userId`
   - `jobId`
3. Load `compute/load-job-context.graphql` to confirm the job exists and read current ports.
4. Build the `ports` array as the **complete desired set** of `PortInput`
   (`{ name?, port }`), preserving any existing mappings the user wants to keep.
5. Restate the target job id and the new port configuration.
6. Ask for confirmation.
7. Execute `compute/update-job-ports.graphql` with the new ports array.
8. Read back the job to verify port update and take access URLs from `links` (not from the `ports` response — `links` are the generated addresses).
9. Explain derived link behavior: `8080` is always `auxiliary` (`{user}-{jobid}`); a non-8080 mapping mints its own link — `{user}-{name}` when named, else `{user}-{jobid}-{port}`.
10. Clarify presence condition: these mapped URLs are usually visible only while the job is `RUNNING` and endpoint provisioning has completed.
11. If the user's underlying goal was "open my service", continue into `references/workflows/compute/access-job-service.md` to hand back the clickable URL.

## Guardrails

- Validate that each port is a valid integer and not a reserved/platform-internal port (`22, 80, 4545, 5901, 6006, 6637, 7088, 8200, 8300, 8888`, plus `8080` — the default auxiliary slot); max 5 custom mappings. If the user asks to "map/expose 8080", correct them: bind `0.0.0.0:8080` and read `links.auxiliary` (no mutation).
- Send `name` (optional) in each `PortInput` — **not** `customizedName`, which the
  rename removed.
- The served app must bind `0.0.0.0` — a service on `127.0.0.1`/`localhost` is unreachable through the mapping even when declared.
- Explain to the user that `ports` are declarations and `links` are generated access addresses.
- Do not promise fixed hostnames for mapped ports; always use readback `links` as source of truth.

## Failure Translation

- permission denied -> the current user cannot manage this job
- invalid ports -> one or more port mappings are malformed

## GraphQL Operations

- `references/graphql-operations/compute/update-job-ports.graphql`
- `references/graphql-operations/compute/load-job-context.graphql`
