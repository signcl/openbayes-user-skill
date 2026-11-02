---
tier: confirm
title: 更新 serving 版本配置
effect: 副本数与规格立即变化，资源开销随之改变
subject: id
highlight: [version, input]
---

# serving-version-update.vars.md

`updateServingVersion` covers three distinct intents that share one input shape. Pick deliberately — and route through the right workflow:

| Intent | Workflow | input shape |
|---|---|---|
| Restart a stopped version (status `CANCELLED` / `FAILED`) with the same config | `references/workflows/serving/restart-serving.md` | `{ "replica": <currentReplica> }` |
| Scale a live version (status `RUNNING` / `PREPARING`) up or down | `references/workflows/serving/update-serving-version.md` | `{ "replica": <newReplica> }` |
| Annotate a version's description | `references/workflows/serving/update-serving-version.md` | `{ "description": "<text>" }` |

`UpdateServingVersionInput` does **not** allow changing `runtime`, `resource`, `dataBindings`, `predictor`, or `sourceCode` — those are immutable on a `ServingVersion`. If the user needs any of those changed, that is a new version: see `references/workflows/serving/create-serving-version.md`.

## vars.restart.json — restart a stopped version

```json
{
  "username": "<owner>",
  "id": "<servingId>",
  "version": 8,
  "input": { "replica": 1 }
}
```

`replica` must equal the version's **current** `replica` (read it from `serving/serving-read-version.graphql` first). Same value tells the server "re-deploy the existing pods, do not scale". Different value would be a scaling change, not a restart.

Action gate: only `CANCELLED` / `FAILED` versions can be restarted. Console mirrors this in `ServingVersionItemDropdown.tsx` (`canRestart = ['FAILED','CANCELLED'].indexOf(status) >= 0`).

## vars.scale.json — change replica count on a running version

```json
{
  "username": "<owner>",
  "id": "<servingId>",
  "version": 8,
  "input": { "replica": 3 }
}
```

Only valid when the version is `RUNNING` or `PREPARING`. The platform reconciles pod count to the new value.

## vars.describe.json — annotate the version

```json
{
  "username": "<owner>",
  "id": "<servingId>",
  "version": 8,
  "input": { "description": "post-mortem: pre-debt config, restarted 2026-05-25" }
}
```

Description is free-form text. Useful when restarting a version to record why.

## UpdateServingVersionInput fields

From `references/graphql/schema.graphql`:

```graphql
input UpdateServingVersionInput {
  replica: Int
  description: String
  size: Int
}
```

`size` is a storage-related hint, rarely set by hand — leave it out unless explicitly directed.

## Response shape

`updateServingVersion` returns the same `ServingVersion` it operated on. Confirming success:

- For restart: read back via `serving-read-version.graphql` and expect `status` to move from `CANCELLED`/`FAILED` to `PREPARING`/`RUNNING`.
- For scale: `replica` on read-back should match the input.
- For describe: `description` on read-back should match.

If the mutation returns `null` with no GraphQL errors, treat it as failure (see `references/graphql-discipline.md`), not silent success — read back to confirm whether anything changed before any follow-up.
