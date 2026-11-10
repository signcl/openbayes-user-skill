# Download a Model from a Public Registry (ModelScope / Hugging Face)

Use this workflow when the user wants a model (or dataset) from a public registry brought into their OpenBayes/HyperAI environment — fast, cost-efficient, and without exhausting `/output` capacity.

**Downloading is the fallback, not the first move.** Two things are deliberately not duplicated here: the dataset-side mechanics (create dataset + empty version, RW bind, flip to RO) live in `populate-version.md` Path A, and the shell-level download procedure (CLI install, mirror/accelerator env vars, tmux, symlink pitfalls) is documented for users in `references/openbayes-docs/data-warehouse/import-public-models.md`. This file owns what an agent needs on top of those: the public-model gate, the destination decision, and the cheap-instance strategy.

## Gate: search public models first

Before proposing any download, search the platform's public models — they are already in the warehouse, bind read-only without consuming the user's storage, and cost nothing to "fetch".

1. Run `dataset/dataset-search-public.graphql` with `category: [MODEL]` and `tagNames: ["public"]` (full flow, including cross-language alias retries such as `通义千问` → `Qwen`, in `common/explore-public-resources.md`).
2. **Hit** — recommend binding that version directly (`compute/create-job.md`); the rest of this workflow does not apply.
3. **Miss** — say so explicitly ("公共模型里没有收录 X"), then continue below.

Skipping this gate is a real cost to the user: a download they did not need, plus warehouse quota for a copy of something the platform already hosts.

## Registry preference by vendor

- **OpenBayes** vendor: prefer **ModelScope** — hosted in China, fast without any mirror.
- **HyperAI** vendor: prefer **Hugging Face**. HyperAI containers usually reach HF directly — **test direct access first**, then only set `HF_ENDPOINT=https://hf-mirror.com` if the test fails. The mirror routes through China and can be slower from non-domestic cluster networks, so do not apply it by default.

  Probe the **model you are about to download**, not the root page — `huggingface.co` can answer while the file CDN it redirects to is unreachable, which is exactly the case the mirror exists for. Follow redirects so the probe reaches that CDN:

  ```bash
  # 200 => direct works, leave HF_ENDPOINT unset
  curl -sIL -o /dev/null -w '%{http_code}\n' \
    https://huggingface.co/<模型 ID>/resolve/main/config.json
  ```

  For a gated or private model, export the same `HF_TOKEN` the download will use (`-H "Authorization: Bearer $HF_TOKEN"`) — otherwise a `401`/`403` reports as a network failure and sends you to the mirror for the wrong reason. If the model has no `config.json`, probe any small file it does have.
- If the user names a registry explicitly, use that one.

## Destination decision (before downloading anything)

Discuss with the user; two options:

| | Option 1: direct-to-dataset (recommended) | Option 2: direct to `/output` |
|---|---|---|
| How | Create dataset (`category: MODEL`) + empty version, RW-bind to `/input{N}`, download straight into it, flip to RO when done | Download into `/output/<model-dir>` |
| Pros | No workspace capacity consumed; any other job can mount the version without re-downloading | Simple; no container restart |
| Cons | Needs a workspace restart to bind the version | Eats `/output` capacity; not reusable across workspaces |

**Rule of thumb**: for large models (>10 GB), strongly avoid Option 2 — it will exhaust workspace disk. For smaller models still recommend Option 1 for reuse, but let the user decide.

For Option 1, follow `populate-version.md` Path A with one difference: **skip its step 3 (`mv` from `/output`)** — here the artifact is downloaded directly into the RW-bound `/input{N}`, never passing through `/output`. Binding uses `bindingAuth: READ_WRITE` (the enum has no `WRITE` value), and the same anti-patterns apply (never bind to `/output`).

## Cost optimization: download on a cheap instance

GPU sits idle for the whole download. If the user has not started a container yet, or is on an expensive GPU (RTX 4090 / A100):

- Propose running the download on the cheapest CPU-only instance, RW-bound to the same empty version.
- After the download completes and the version is flipped to RO, start the target GPU instance and mount the version read-only.

This avoids paying GPU rates during download. It costs one extra instance switch — surface the trade-off and let the user choose.

## Execution

The commands, mirror/accelerator env vars, tmux wrapper and known pitfalls are in `references/openbayes-docs/data-warehouse/import-public-models.md`. Follow that page, with the destination this workflow settled on: Option 1 → `/input{N}/<model-dir>` (the RW-bound empty version), Option 2 → `/output/<model-dir>`.

**One deviation from that page.** Its Hugging Face snippets — both the plain one and the `tmux new -d -s model-download 'export HF_ENDPOINT=...; ...'` wrapper — hard-code `export HF_ENDPOINT=https://hf-mirror.com`. That page is a mirror of the product docs and is written for domestic networks; it does not know about the direct-first rule above. Apply the rule, not the snippet: when the resolve-URL probe above returns `200`, **`unset HF_ENDPOINT`** instead of exporting it. Only keep the export when the probe fails.

Dropping the inline `export` is not enough on its own — if the image or the user's shell profile already has `HF_ENDPOINT` set, `hf` inherits it and downloads through the mirror anyway, while the probe still reports `200` (`curl` ignores the variable). So unset it explicitly, and inside the tmux wrapper too, since that command runs its own shell:

```bash
# direct probe returned 200
unset HF_ENDPOINT
tmux new -d -s model-download 'unset HF_ENDPOINT; \
  hf download <模型 ID> --local-dir <目标目录> 2>&1 | tee /output/logs/download.log'
```

Background-task discipline, including the fallback when the user declines tmux, is in `workflows/common/workspace-runtime.md`.

After the download finishes:

- Report progress the way the run allows — under tmux, the session name and `tail -f /output/logs/download.log`; otherwise what `workspace-runtime.md` prescribes.
- **Verify completeness programmatically** — see the next section. Do not sign off on an eyeballed comparison against the registry page.
- Option 1: continue with `populate-version.md` Path A steps 4–6 (flip to RO, verify `version.size > 0`).

## Completeness Verification

A partial download does not announce itself: the command exits `0`, and six
missing shards out of eighty look identical to success in a progress log.
Comparing "file count and total size" against the registry page by eye does not
catch it either. It surfaces much later as a `FileNotFoundError` inside model
loading.

**Diff the file lists — do not compare counts.** Two sets of equal size can
still differ.

```python
import os
from huggingface_hub import HfApi

REPO, LOCAL = "<模型 ID>", "<目标目录>"
SKIP = {".cache", ".git"}                    # one rule, applied to both sides

remote = {f for f in HfApi().list_repo_files(REPO)
          if not set(f.split("/")) & SKIP}

local, seen = set(), set()
for root, dirs, files in os.walk(LOCAL, followlinks=True):
    st = os.stat(root)                       # symlink cycles are real: guard by identity
    if (st.st_ino, st.st_dev) in seen:
        dirs[:] = []
        continue
    seen.add((st.st_ino, st.st_dev))
    dirs[:] = [d for d in dirs if d not in SKIP]
    for f in files:
        local.add(os.path.relpath(os.path.join(root, f), LOCAL))

missing = sorted(remote - local)
print(f"remote={len(remote)} local={len(local)} missing={len(missing)}")
for f in missing:
    print("  MISSING", f)
```

Two things in that loop are easy to get wrong. `followlinks=True` is required —
without it a symlinked directory walks as empty, which reads as a different
layout rather than an error. But following links means a directory-symlink cycle
would traverse forever, so the inode/device guard is required too: without it a
single real file came back as 34 phantom paths in a trivial test tree. Pass the
download's credential (`HfApi(token=...)`) for a gated repo.

Re-run the same `hf download` for anything in `missing` — it fetches only what
is absent — then re-check until empty.

**Without a listing API (ModelScope, etc.):** re-run the download command. Both
`hf` and `modelscope` skip already-complete files, so a second run that fetches
nothing is itself the signal.

### Presence is not integrity

A name diff proves each file **exists**, not that it is complete — a truncated
shard has the right path and passes. Always follow the diff with:

```bash
find <目标目录> -type f \( -size 0 -o -name '*.part' -o -name '*.incomplete' \)
```

Any hit needs re-fetching regardless of what the diff or the download log said.
For a model you are about to serve, the real integrity check is loading it once
before handing it over — that is what catches a corrupt-but-right-sized shard,
and it is cheaper than discovering it in production.

## Guardrails

- ❌ Do not download before searching public models — an uncollected model is the premise of this workflow, not an assumption.
- ❌ Do not download to `/output` without discussing the destination; for >10 GB models push hard for Option 1.
- ❌ Do not start a large download on an expensive GPU instance without surfacing the cheap-CPU-instance option.
- ❌ Do not leave symlinked files inside a dataset directory (see the docs page above).

## GraphQL Operations

- `dataset/dataset-search-public.graphql` (the gate)

Only Option 1 needs the rest, all via `populate-version.md` Path A:

- `dataset/dataset-create.graphql`
- `dataset/dataset-version-create-empty.graphql`
- `compute/restart-workspace.graphql`

## See Also

- Public-model search flow (aliases, listing semantics): `workflows/common/explore-public-resources.md`
- Dataset RW→RO double-restart mechanics + anti-patterns: `workflows/dataset/populate-version.md`
- Storage cost model (workspace capacity vs warehouse quota): `workflows/common/storage-semantics.md`
- User-facing download procedure (commands, mirrors, pitfalls): `references/openbayes-docs/data-warehouse/import-public-models.md`
- Deploying the model once it is in the warehouse: `workflows/serving/build-serving-from-scratch.md`
