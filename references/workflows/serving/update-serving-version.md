# Update Serving Version

Use this workflow when the user wants to update a specific serving version's mutable settings, **scale** its replica count, or **restart** a stopped version (see "Special use: restart" below).

## What `UpdateServingVersionInput` can actually change

`ServingVersion` is **immutable** for `runtime`, `resource`, `dataBindings`, `predictor`, and `sourceCode`. Once a version exists those are frozen. The only mutable fields are:

| Field | Effect |
|---|---|
| `replica` | Set desired replica count. Side effect: also acts as the **restart trigger** for `CANCELLED` / `FAILED` versions when set to the current value (see below). |
| `description` | Human-readable version note. |
| `size` | Storage/quota size hint. Rarely used by hand. |

If the user actually wants to change runtime / resource / bindings, that's **not** an update — it's a **new version**. Send them to `references/workflows/serving/create-serving-version.md`.

## Prechecks

Before any serving operation, verify the `SERVING` feature is enabled:

1. Load party context via `common/load-party-context.graphql`.
2. Check `party.features` contains `SERVING`.
3. If `SERVING` is not present, refuse the operation.

## Special use: restart a stopped version

`updateServingVersion(input: { replica: <currentReplica> })` against a `CANCELLED` or `FAILED` version is how the platform re-deploys it — same config, no new version number. **Do not use `createServingVersion` for restart**; that creates a wasted new version.

This is a frequent enough case that it has its own workflow file with the full discipline: see `references/workflows/serving/restart-serving.md`. Route there when the intent is "把停掉的 version 起回来" rather than "改 replica" or "改 description".

## Required Reads

Before mutation, load:

- current serving version state with `serving/serving-read-version.graphql` — needed to read the current `replica` (so restart sends the same value) and to check `status` for the restart gate.

## Deterministic Steps

1. Load current version state with `serving/serving-read-version.graphql`. Record `status`, `replica`, `description`.
2. Decide the intent:
   - **Restart** (status `CANCELLED` / `FAILED`, user wants it back up) → send `{ replica: <currentReplica> }`. Branch to `restart-serving.md` for full discipline.
   - **Scale** (status `RUNNING` / `PREPARING`, user wants a different replica count) → send `{ replica: <newReplica> }`.
   - **Describe** (annotate the version) → send `{ description: "<text>" }`.
3. Restate the operation: target `<servingId>` version `<n>`, current vs new values for the field(s) being touched, and the expected status transition.
4. Ask for confirmation.
5. Execute `serving/serving-version-update.graphql` with `--confirm-mutation-target`.
6. Read back via `serving/serving-read-version.graphql` and verify the change took effect.
7. If the update was a restart or scale that changes pod topology, continue to `references/workflows/serving/read-serving-status.md` for readiness verification.

## Guardrails

- Always confirm before mutation.
- Always read-back after write.
- Never advertise runtime / resource / binding changes through this workflow — they require `createServingVersion`.
- When restart is the intent, prefer `restart-serving.md` (it adds the status gate and worked example).

## Failure translation

- mutation returns `null` with no errors → treat as failure (see `references/graphql-discipline.md`); read back and inspect for quota / debt / runtime availability blockers.
- "version not found" → version number is wrong or has been deleted.
- permission denied → token does not have write access to this serving.

## GraphQL Operations

- `references/graphql-operations/serving/serving-version-update.graphql`
- `references/graphql-operations/serving/serving-read-version.graphql`
