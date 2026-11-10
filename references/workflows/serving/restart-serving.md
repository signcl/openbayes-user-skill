# Restart Serving Version

Use this workflow when a `ServingVersion` has been stopped (status `CANCELLED` or `FAILED`) and the user wants to bring **the same version** back up — typical triggers: "重启 serving srv-xxx", "serving 被欠费关了帮我打开", "把上次跑的那个 serving 起回来", "把 cancelled 的 version 重新拉起来".

## What restart actually is

`ServingVersion` is **immutable** — `runtime`, `resource`, `replica`, `dataBindings` are all baked in at version creation time and cannot be changed afterwards. Therefore "restart" never means "edit the version and re-run"; it means **re-deploy the existing version with its existing config**.

The mutation that re-deploys a stopped version is `updateServingVersion` with `input: { replica: <currentReplica> }`. Passing the same `replica` value is the server's signal to spin the pod back up using the version's frozen config. The console's "Restart" button does exactly this (see `console/src/pages/ServingPage.tsx` → `restartVersion`).

## ⚠️ Do not use `createServingVersion`

`createServingVersion` mints a **new** version (version number +1) with a fresh `CreateServingVersionInput`. Use it only when the user wants a real new deploy — for example after the source workspace's `/output` changed, or to change `runtime` / `resource` / `replica`. Using it for a plain restart wastes a version number and breaks version-pinned monitoring / API consumers.

If unsure whether the user wants restart or new version, **ask**.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Action gate

Restart is only valid when the target version's `status` is `CANCELLED` or `FAILED`. This matches console's `canRestart` rule (`['FAILED','CANCELLED'].indexOf(status) >= 0`).

| Current status | Action |
|---|---|
| `CANCELLED`, `FAILED` | Proceed with restart |
| `RUNNING` | No restart needed — version is already up |
| `PREPARING` | Already coming up — wait, don't restart |
| `CANCELLING` | Wait for it to reach `CANCELLED`, then restart |

## Deterministic Steps

1. Identify the target version. If the user only named the serving, default to `latestServingVersion` from `serving/serving-read-overview.graphql` or `serving/serving-list.graphql` (filtered to that serving).
2. Load the target version with `serving/serving-read-version.graphql`. Extract `status` and `replica`.
3. Verify the action gate (status ∈ `{CANCELLED, FAILED}`). If not, stop and report.
4. Restate the operation:
   - target `<servingId>` / `<servingName>` version `<n>`
   - current status → expected `PREPARING` → `RUNNING`
   - `replica` (same as before — no scaling)
5. Ask for explicit confirmation.
6. Execute `serving/serving-version-update.graphql` with:
   ```json
   {
     "username": "<owner>",
     "id": "<servingId>",
     "version": <n>,
     "input": { "replica": <currentReplica> }
   }
   ```
   Always include `--confirm-mutation-target`.
7. Read back via `serving/serving-read-version.graphql` and verify `status` has moved to `PREPARING` (or further). Continue to `references/workflows/serving/read-serving-status.md` for full readiness.

## Worked example

A serving `vycpv1a7wiky` version 8 is `CANCELLED / QUOTA_EXHAUSTED` after debt eviction; admin cleared the debt and wants the version back online. The version's frozen `replica` is `1`.

Vars for `serving-version-update.graphql`:
```json
{
  "username": "zhangsan",
  "id": "vycpv1a7wiky",
  "version": 8,
  "input": { "replica": 1 }
}
```

Expected response (subset):
```json
{
  "updateServingVersion": {
    "servingId": "vycpv1a7wiky",
    "version": 8,
    "replica": 1
  }
}
```

Read-back should show `status: PREPARING` then eventually `RUNNING` with instances `ready: true`.

## When NOT to use this workflow

- User wants a **new version** because the workspace / code / model changed → use `references/workflows/serving/create-serving-version.md` (runs preflight against a source job).
- User wants to **change `replica`** (scale up/down) on a still-running version → use `references/workflows/serving/update-serving-version.md` — same mutation, different intent.
- User wants to **restart a workspace** (not a serving) → use `references/workflows/compute/restart-job.md`.

## Failure translation

- `version.status` already `RUNNING` / `PREPARING` → "version 已经在跑，不需要 restart"
- `version.status == CANCELLING` → "version 正在停止过程中，请等它进入 CANCELLED 再 restart"
- mutation returns `null` with no errors → treat as failure (see `references/graphql-discipline.md`); read back the version status and check whether quota / debt / runtime availability blocks it
- permission denied → "token 无权操作这个 serving"

## GraphQL Operations

- `references/graphql-operations/serving/serving-read-version.graphql` — load current version
- `references/graphql-operations/serving/serving-version-update.graphql` — the restart mutation
- `references/graphql-operations/serving/serving-list.graphql` — find latest version when user only named the serving
- `references/graphql-operations/serving/serving-read-overview.graphql` — alternative for serving-level lookup
