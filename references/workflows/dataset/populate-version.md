# Populate a Dataset Version (cache workspace artifacts)

Use this workflow when the user wants to cache something currently living in a workspace `/output` — a downloaded model, an intermediate artifact, a generated dataset — into a dataset version, so it can be reused across jobs without re-creating.

## Goal

End state: the artifact lives in a dataset version, and the workspace reads it via a **read-only** binding to `/input{N}`. This frees `/output` capacity and lets other jobs mount the same version cheaply.

Common trigger: "yolo26 模型下载太慢，下次还要用，把它存到数据集里。"

## Decision: do you even need to cache?

Skip this workflow when:

- Artifact is small (≲ a few hundred MB) and only used by this user.
- No cross-job reuse value.

Workspace capacity is fixed per resource (e.g. 50 GB on RTX 3090). Only cache when capacity is tight or the reuse value is real. **Do not propose this workflow proactively just because something is in `/output`.**

## Path A — RW binding → swap to RO (preferred)

More flexible than CLI upload: inside the RW mount you can `mv`, rename, reorganize freely before locking the version as RO.

1. **Create dataset (or model) + empty version.**
   - Dataset/Model: `workflows/dataset/create-dataset.md` (`dataset-create.graphql`). Use `category: MODEL` if the cached asset is a model (e.g. checkpoint, weights), and `category: DATASET` for general data.
   - Empty version: `workflows/dataset/create-empty-version.md` (`dataset-version-create-empty.graphql`).
   - Record the returned `datasetId` and `version` number.

2. **Restart the workspace, RW-binding the empty version to `/input{N}`.**
   - Pick any `/input0`–`/input4` slot not already in use.
   - `bindingAuth: READ_WRITE` in the `DataBindingInput` (the `BindingAuth` enum has only `READ_ONLY` / `READ_WRITE` — there is no `WRITE`).
   - **Do NOT bind to `/output`** — see Anti-patterns below.
   - `/output` (where the artifact currently sits) is preserved across restart; only `/input*` bindings change.

3. **Move the artifact into the bound location.**
   ```bash
   mv /output/yolo26m.pt /input0/
   ```
   Writes to a RW-bound `/input{N}` go into the user's data warehouse (consumes warehouse quota, **not** workspace capacity — see `workflows/common/storage-semantics.md`).

4. **Restart again, flipping the binding to RO.**
   - Same dataset version, same `/input{N}` path, `bindingAuth: READ_ONLY`.
   - The version's data is now frozen; the RO mount has no warehouse-write cost.

5. **Update notebooks / scripts** to read from `/input{N}/<file>` instead of `/output/<file>`.

6. **Verify.**
   - `ls -la /input{N}/` in the container shows the artifact at expected size.
   - Re-read the version via `dataset/load-dataset-context.graphql` and confirm `version.size > 0` and `version.subStatus` is no longer `EMPTY`.

## Path B — bayes CLI upload (alternative)

Use when the artifact lives on the user's laptop (not in a running workspace), or when scripting an upload (CI, batch jobs).

Full reference: `references/openbayes-docs/cli/upload-dataset.md`.

```bash
bayes data new-version <datasetId>                # creates empty version, returns N
bayes data upload <datasetId> -v <N> -p <local-path>
```

After upload, restart the workspace with the version RO-bound to `/input{N}` (Path A step 5–6).

**Container-side auth:** the workspace image pre-installs `bayes`, injects `OPENBAYES_TOKEN`/`OPENBAYES_ORG`, and runs `bayes login` at container startup — `bayes data ...` usually works directly. Check `bayes status` first; if un-authenticated, the startup auto-login silently failed (usually CLI-version drift). Remediation: `workflows/common/container-dev-quickref.md` → "bayes CLI (in-container)".

## Anti-patterns (do not do)

❌ **Bind any external dataset version to `/output`.**
`/output` is the workspace working directory itself: `/openbayes/home` and `/hyperai/home` are symlinks to `/output`. Binding a dataset (especially an empty version with RW) to `/output` replaces the workspace contents with the dataset contents — workspace files appear to vanish. Always mount dataset versions at `/input{N}`.

❌ **Use `updateDatasetVersionBindingJob` to "trigger archival" of workspace data into a version.**
Based on observed behavior, this mutation does not move data: after invocation the version still reports `subStatus: EMPTY, size: 0`. The schema has no docstring, but the mutation appears to only record a metadata link between a version and a job — not a data-transfer trigger. Use Path A or Path B instead.

❌ **Relocate `/output` files to another workspace "to protect them" before adding a new `/input*` binding.**
`/output` is preserved across restart unless something else is bound over `/output`. Changing or adding `/input*` bindings does not touch `/output`. Pre-emptive relocation is unnecessary work and risks losing data on the move.

## GraphQL Operations

- `dataset/dataset-create.graphql`
- `dataset/dataset-version-create-empty.graphql`
- `dataset/load-dataset-context.graphql`
- `compute/restart-workspace.graphql`

## See Also

- Mount path rules: `workflows/compute/create-job.md` → Data Binding Canonical Rules.
- Storage cost model (workspace capacity vs warehouse quota): `workflows/common/storage-semantics.md`.
- bayes CLI in-container caveats: `workflows/common/container-dev-quickref.md`.
- bayes CLI reference: `references/openbayes-docs/cli/upload-dataset.md`, `references/openbayes-docs/cli/login.md`.
