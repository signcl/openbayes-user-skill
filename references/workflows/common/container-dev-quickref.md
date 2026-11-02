# Container Development Quick Reference

Condensed lookup for common container development questions. For full details, see the linked reference docs.

## Which Container Doc To Use

Use this file as the first stop when the user is operating inside a running container and the task spans multiple concerns: identifying the job, paths, storage, ports, sandbox, SSH, Jupyter links, dependency persistence, or the in-container `bayes` CLI.

For narrower tasks, jump directly to the focused reference:

| User need | Primary reference |
|---|---|
| Start a program, demo, training run, install, or any long-lived command inside the workspace | `references/workflows/common/workspace-runtime.md` |
| SSH connection details, non-interactive password auth (`sshpass` / no `sshpass`), reconnect behavior, SSH-specific timeout handling | `references/workflows/common/ssh-best-practice.md` |
| Upload local code, run it remotely, then download artifacts | `references/workflows/compute/run-experiment-end-to-end.md` |
| Open a running web service URL or debug `auxiliary`/502 | `references/workflows/compute/access-job-service.md` |
| Add or change custom exposed ports | `references/workflows/compute/update-job-ports.md` |
| Explain `/output`, `/input*`, persistence, or storage pressure | `references/workflows/common/storage-semantics.md` |

If multiple rows apply, read the primary workflow first, then return here for quick facts. This quickref should not override focused workflow rules.

## 从 console 容器 URL 拿到 job

用户常常直接贴一个 console 容器链接（`https://<host>/console/{ns}/containers/{id}`）说「进这个容器改文件 / ssh 进去 / 重启」。**动手前先把 URL 解析成真正的 jobId**：

- `/containers/{id}` 里的 `{id}` 是 **projectId**（含大写字母，如 `2VuHS8AEpYu`），**不是** `job.id`（小写 base36，如 `ka2fi3o7ucuf`）。直接把它当 jobId 传给 `job(userId, jobId)` 会得到「找不到该资源」，且无法靠编码反解。
- 解析：`project(projectId).jobs(userId, projectId, status:[RUNNING], mode:WORKSPACE)` → 取 `jobs.data[].id` 得到 jobId（一个 container 通常对应一个当前 workspace 版本）。容器已停时去掉 `status` 过滤再按需重启。
- `userId` 取 URL 里的 `{ns}`——**可能是 username，也可能是 org slug**（如 `hyperai-tutorials`）；org 容器要用 org slug。
- 对比：job 自己的 `links.frontend` 是 `/{ns}/jobs/{job.id}` 形式，那个路径段才直接是 jobId。

权威说明见 `references/console-navigation.md` 的 `/{ns}/containers/{id}` 一行。

## Persistent Storage

| Path | Persists across restart? | Notes |
|------|--------------------------|-------|
| `/output` | Yes | Working directory. Vendor-specific mount: `/openbayes/home`, `/hyperai/home`, etc. |
| `/input0` ~ `/input4` | Yes (read-only) | Data warehouse bindings. Mounted at vendor root, e.g. `/openbayes/input/input0`. |
| `/` (root) | No | System disk. Everything outside `/output` and `/input*` is lost. |
| `pip install --user` | Yes | Installed to `/output/.pylibs`. Works on both Conda and uv runtimes. |
| Conda envs under `/output` | Yes | Conda runtimes: `conda create -p /output/myenv python=3.10` |
| uv venvs under `/output` | Yes | uv runtimes: `uv venv /openbayes/home/myenv` (set `UV_PYTHON_INSTALL_DIR=/openbayes/home/.uv/python` first if downloading a different Python). |
| `apt install` packages | No | Re-install on each restart, or use a `dependencies.sh` script. |
| `pip install` (no --user) | No | Goes to system site-packages, lost on restart. |
| `uv pip install` (no venv) | No | uv runtimes: installs into `/opt/venv`, lost on restart. Use `pip install --user` to persist. |

Full reference: `references/openbayes-docs/gear/storage-persistence.md`

## Path Mapping

| What you see | Actual container path |
|--------------|-----------------------|
| `/output` | Vendor root + `/home` (e.g. `/openbayes/home`) |
| `/input0` ~ `/input4` | Vendor root + `/input/input0` ~ `/input/input4` |
| JupyterLab file browser `/home` | Same as `/output` |

Typical data flow:

```text
Read training data from   /input0
Read pretrained model from /input1
Save code, checkpoints to  /output
```

Full reference: `references/openbayes-docs/gear/workspace.md`

## Port Exposure

| Item | Value |
|------|-------|
| Default exposed port | `8080` — reached at `links.auxiliary`, no mapping needed |
| Reserved ports (cannot map) | 22, 80, 4545, 5901, 6006, 6637, 7088, 8200, 8300, 8888 (platform-internal services), plus `8080` (the default auxiliary slot — row above). |
| Max custom mappings | 5 per container |
| Bind address | Must use `0.0.0.0` (not `127.0.0.1` or `localhost`) |

**To hand the user a URL to open a running service**, see
`references/workflows/compute/access-job-service.md`. Short version: app on `8080`
⇒ `links.auxiliary`; app on another port ⇒ that port's `links[]` entry. Read the
URL from `links`; never assemble it by hand.

### `auxiliary` (8080) vs the sandbox agent

`auxiliary` is the **8080 app slot** — the URL the user's own service is expected to answer on. The sandbox agent is a **separate** link (`sandbox`, see "Sandbox HTTP API" above); detect it via the `sandbox` link, **never** by probing `auxiliary`.

The current agent (v0.2.1) is **path-routed and does not occupy 8080** — observed on a sandbox-enabled job: `/sandbox/healthz` returned `200` while its `auxiliary` (8080) returned `502` (no app bound). So 8080 is normally free for the user's own app, and binding to it is fine. (Older agent builds bound `:8080` directly, which made `auxiliary` reach the sandbox and could collide with a user app on 8080. If you need certainty for a specific container, check `ss -tlnp | grep :8080` inside it — don't infer from `curl localhost:8080`.)

When the user adds a custom service on a **non-8080** port, bind a non-reserved
port (Gradio's `7860`, Streamlit's `8501`, FastAPI's `8000`, etc.) and register
it via `compute/update-job-ports.graphql` — the name field is **`name`** on both
input and output (see `references/graphql-operations/compute/update-job-ports.vars.md`).
The platform mints a **new dedicated URL** (a separate `Job.links[]` entry),
shaped by whether the mapping has a `name`:

- **With `name` set** (e.g. `"vllm"`): `https://{user}-{name}.{domain}` → `https://zhangsan-vllm.gear-c1.openbayes.net`. Stable, human-friendly. Recommended.
- **Without `name`**: `https://{user}-{jobid}-{port}.{domain}` → `https://zhangsan-abc123-7860.gear-c1.openbayes.net`. Port number shows in URL. Use when an automation just needs *any* URL and naming is not worth surfacing.

See `references/openbayes-docs/gear/expose-service.md` for full URL semantics.

Public access URL forms (read the actual value from `links`, never hand-build):

```text
8080 app (default):       https://{user}-{jobid}.{domain}          (= links.auxiliary)
non-8080, named:          https://{user}-{name}.{domain}
non-8080, unnamed:        https://{user}-{jobid}-{port}.{domain}
```

SSH tunnel (temporary, personal access only):

```bash
ssh -N -L localhost:<local_port>:localhost:<container_port> root@ssh.openbayes.com -p<ssh_port>
```

Full reference: `references/openbayes-docs/gear/expose-service.md`

## Sandbox HTTP API (operate the container without SSH)

`links.sandbox` means the mastra-workspace sandbox agent is injected. It is a specialized HTTP/WS transport, not a reason to restart a workspace.

**Presentation discipline:** sandbox is platform-injected Agent infrastructure. Use it freely to operate the container, but do not list `links.sandbox` when presenting a job's links, and do not volunteer the concept; Mastra/HTTP-only integration work is normal sandbox talk, not volunteering. `mode == SANDBOX` containers are likewise hidden from user-facing listings. Rule and its exceptions: `references/workflows/compute/list-jobs.md`.

| Context | Default |
|---|---|
| Ordinary Codex/CLI with SSH/scp | SSH/scp |
| Long task, tmux/logs, large files | SSH/scp |
| Mastra SDK, browser/server agent, HTTP-only/no SSH | use `links.sandbox` over HTTP if present |

Facts:

- Detect sandbox only from `Job.links[name=="sandbox"]`; never infer it from `auxiliary`.
- Missing sandbox on a `RUNNING` workspace -> use SSH/scp or create a new workspace; do not restart just to inject it.
- Auth for real endpoints: `Authorization: Bearer <Job.password>`; `/healthz` is unauthenticated.

| Need | Call |
|------|------|
| Read a file (≤ ~50 MB) | `POST $SANDBOX/v1/fs/read` `{"path","encoding":"base64"}` → `{content,size,mtimeMs}` |
| Write a file (≤ ~50 MB) | `POST $SANDBOX/v1/fs/write` `{"path","content","encoding":"base64"}` |
| Exec a command | WS to `$SANDBOX`, subprotocol `sandbox.v1.exec+json`, first frame `{"type":"start","cmd","args":[...],"cwd"}` |

For files larger than ~50 MB, use `scp`/`rsync` over `links.ssh` — the sandbox body limit is ~128 MiB and base64 inflates payloads 4/3. Size guide: ≤50 MB sandbox is fine; 50–95 MB may work but prefer `scp`; >95 MB must use `scp` because sandbox can return 413 or hang.

## SSH Access

| Scenario | Command |
|----------|---------|
| External access | Use `links.ssh` from job context (format: `ssh root@ssh.openbayes.com -p<port>`) |
| Password | `Job.password` from job context — same secret as the JupyterLab login token and the `?token=` value in `links.workspace-with-password`. Treat as sensitive. |
| Non-interactive login | `ssh`/`scp` only take the password from a terminal; from a tool they hang at `password:` until timeout. Check `command -v sshpass` first: with it, `sshpass -f <0600 file> ssh …`; without it, `-o BatchMode=yes` to fail fast, then install `sshpass`, use the Sandbox HTTP API, install a public key, or `expect`. Commands and order: `references/workflows/common/ssh-best-practice.md` → "Authentication". |
| Inter-container | `ssh <container_ip>` (keys pre-shared for same owner, get IP via `ip a`) |

## JupyterLab Access

| Need | How |
|------|-----|
| Open the lab UI | Use `links.workspace-with-password` if present (auto-login). Fall back to `links.workspace` + manual `Job.password` entry. `links.notebook` is a deprecated alias for `workspace`. |
| Deep-link to a specific file | `<workspace-base>/lab/tree/<rel>?token=<Job.password>`, where `<rel>` is the file path relative to `notebook_dir` (`/openbayes` on OpenBayes, `/hyperai` on HyperAI). |

Full reference (link names, password identity, deep-link examples): `references/ui-links.md`

For long-running programs in a workspace, recommend tmux with a persisted log and ask the user before using it:

```bash
mkdir -p logs
tmux new -d -s workspace-demo 'your_command 2>&1 | tee -a logs/demo.log'
```

If the user accepts, use a purpose-specific session name and report the session name plus log path back to the user. If they decline, follow the non-tmux fallback rules in `references/workflows/common/workspace-runtime.md`.

Full reference: `references/workflows/common/workspace-runtime.md`, `references/workflows/common/ssh-best-practice.md`, `references/openbayes-docs/gear/ssh.md`

## Dependency Installation

First identify the runtime family — it changes which env tool to use (persisting deps is the **same on both**):

| Runtime | Detect | Base Python | Isolated-env tool |
|---------|--------|-------------|-------------------|
| Conda (Ubuntu 22.04 & earlier) | `conda --version` works | conda root at `/usr/local` | `conda create -p /output/myenv` |
| uv (Ubuntu 24.04+, e.g. vllm ≥ 0.20, pytorch ≥ 2.11) | `uv --version` works, `conda` missing | venv at `/opt/venv` | `uv venv /openbayes/home/myenv` |

| Method | Persistent? | Where it goes |
|--------|-------------|---------------|
| `pip install --user <pkg>` / `pip install --user -r requirements.txt` | Yes | `/output/.pylibs` — works on both runtime families |
| `conda create -p /output/myenv` (Conda runtimes) | Yes | Under `/output` |
| `uv venv /openbayes/home/myenv` (uv runtimes) | Yes | Under `/output` |
| `pip install <pkg>` (no `--user`) | No | System site-packages |
| `uv pip install <pkg>` (no venv, uv runtimes) | No | `/opt/venv`, lost on restart |
| `apt install <pkg>` | No | System disk |

To install **and persist** a `requirements.txt` (the common ask), the answer on **both** families is `pip install --user -r requirements.txt` → `/output/.pylibs`. uv-runtime specifics:

- Use the **system `pip`** for `--user`, not `uv pip` — uv rejects `--user` by design.
- `pip install --user` transparently **overrides image-shipped packages** (numpy, transformers, …) and persists the new version — the gear-controller shadow-install fix (PR #106). A `requirements.txt` that pins versions of preinstalled packages installs cleanly; `--ignore-installed` is only a fallback for clusters not yet on the fixed gear-controller.
- **Don't build a venv just to persist a few packages** — `pip install --user` is the lighter path. Reserve `uv venv` (under `/openbayes/home`) for an isolated or different-Python environment; install into it with `uv pip install` (no `--user`).
- **Multi-env `--user` cross-contamination (Conda runtimes):** on a second conda env that shares base's **Python minor version**, `pip install --user` silently overwrites base's package (both read the shared `/output/.pylibs/.../pythonX.Y` user-site) — symptom: "installed X in the new env and base's version changed too." Fix by giving the new env a different Python minor version, or disabling user-site (`PYTHONNOUSERSITE=1`) — and a registered **Jupyter kernel needs `-s` on top of that** (`conda env config vars` doesn't reach the kernel). uv runtimes are immune. Full mechanism + both fixes: `references/openbayes-docs/gear/conda.md`.

- **Using a self-built env inside a Jupyter notebook** (the "I made a conda/uv env, how do I select it in the notebook" ask): register it as a **kernel** with `python -m ipykernel install --user` (run it with the env's own Python, after installing `ipykernel` in that env). General flow (Kernel/kernelspec/`kernel.json`, `jupyter kernelspec list`, `--user` survives restart): `references/openbayes-docs/gear/workspace.md` (注册自定义 Kernel). Runtime-specific integration + kernel isolation: `references/openbayes-docs/gear/conda.md` (Conda, needs `-s`) or `references/openbayes-docs/gear/uv.md` (uv, isolated by default).

Recommendation: keep a `requirements.txt` or `dependencies.sh` in `/output` for reproducible setup on restart.

Full reference: `references/openbayes-docs/gear/conda.md` (Conda runtimes), `references/openbayes-docs/gear/uv.md` (uv runtimes)

## bayes CLI (in-container)

The workspace container pre-installs `bayes`, pre-injects `OPENBAYES_TOKEN` and `OPENBAYES_ORG`, points the CLI at the cluster's internal gateway (`bayes switch`), and runs `bayes login $OPENBAYES_TOKEN` at startup (via `lab-entry.sh`). **You should not need to run `bayes login` manually inside a workspace.** Start by checking `bayes status` — if it shows the expected user/org, just use `bayes data ...` / `bayes gear ...` directly.

If `bayes status` shows un-authenticated, the startup auto-login silently failed (the entry script wraps it in `|| true`). The most common cause is **CLI-version drift** — the installed CLI binary doesn't speak the same mutation set as the gateway it was switched to. The symptom when you re-run login manually is `field 'loginWithToken' not found` (newer gateway, older CLI).

Remediation order:

1. `bayes upgrade` — most version mismatches clear after upgrading the binary.
2. Re-run `bayes login $OPENBAYES_TOKEN` (token env var is already set; no need to re-export). Verify with `bayes status`.
3. If `bayes upgrade` is blocked (network policy, older Python), do the operation from a host machine with a current CLI instead.

For uploading workspace artifacts into a dataset version, **RW binding is usually more flexible than CLI upload** (you can `mv`, rename, reorganize inside the mount before locking RO) and doesn't depend on the CLI's auth state. Full decision tree: `references/workflows/dataset/populate-version.md`.

Full CLI reference: `references/openbayes-docs/cli/login.md`, `references/openbayes-docs/cli/upload-dataset.md`
