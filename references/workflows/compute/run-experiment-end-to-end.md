# End-to-end Experiment: Local Code → Workspace → Run → Local Results

Use this workflow when the user wants to take a local script (training, inference, batch processing), run it on an OpenBayes GPU workspace, and pull results back to their local machine. This is the canonical "I want to use OpenBayes as remote compute" path.

**Common trigger:** "把本地代码跑到 openbayes 上"、"upload my train.py to a workspace and download checkpoints when done"。

## Phase 1 — Prepare workspace

1. Bootstrap (`workflows/common/bootstrap.md`) to verify identity and get balance/quota.
2. Decide: use an existing RUNNING workspace, or create a new one.
   - List user jobs: `workflows/compute/list-jobs.md`.
   - Existing RUNNING workspace reuse is allowed only when it is clearly assigned to this task or the user explicitly confirms takeover after you restate the interruption risk. If it may contain someone else's active work, do read-only inspection only and prefer creating a separate workspace.
   - Create new: `workflows/compute/create-workspace.md`.
3. Wait until job status is `RUNNING` before any transfer (poll `inspect-job.md`).
4. From `load-job-context.graphql`, use `links.ssh` + `Job.password` for ordinary CLI transfer. `links.sandbox` is only for Mastra/HTTP-only/no-SSH contexts; read it internally, never list it among the links you present (`compute/list-jobs.md`); missing sandbox never authorizes restart.

## Phase 2 — Detect transfer path

Default: SSH/scp. Use sandbox only for Mastra workspace SDK, browser/server-side agents, HTTP-only automation, or no SSH client.

```bash
# Inspect the job to get the links + password.
# Uses the same op as workflows/compute/inspect-job.md (load-job-context.graphql).
# Replace <your-job-id> and <your-username> with actual values from Phase 1.
JOB_JSON=$(bash <skill-dir>/scripts/run_graphql.sh \
  --vendor openbayes \
  --query-file references/graphql-operations/compute/load-job-context.graphql \
  --vars-json "{\"userId\":\"<your-username>\",\"jobId\":\"<your-job-id>\"}")

# NOTE: run_graphql.sh strips the GraphQL envelope — stdout is the bare `data` object, so jq paths start at `.job`, NOT `.data.job`.
JOB_PASSWORD=$(echo "$JOB_JSON" | jq -r '.job.password')
SSH_LINE=$(echo "$JOB_JSON" | jq -r '.job.links[] | select(.name=="ssh") | .value')
```

## Phase 3 — Upload via SSH (default for ordinary CLI, any size)

`Job.links[name=='ssh'].value` is `ssh root@<host> -p<port>`. Parse host/port with the same regex the SDK uses (`/ssh\s+root@(\S+)\s+-p(\d+)/`).

`$SSH_LINE` was already populated in Phase 2 from `load-job-context.graphql`. Extract host and port:

```bash
# SSH_LINE is already set from Phase 2 JOB_JSON extraction above.
SSH_HOST=$(echo "$SSH_LINE" | sed -E 's|ssh root@([^ ]+) -p[0-9]+|\1|')
SSH_PORT=$(echo "$SSH_LINE" | sed -E 's|.*-p([0-9]+).*|\1|')

# Password auth needs sshpass on the local box (brew install hudochenkov/sshpass/sshpass on macOS,
# apt install sshpass on Linux). Check `command -v sshpass` FIRST: without it, scp/ssh hang at the
# password prompt until the tool times out — the no-sshpass paths (BatchMode fail-fast, sandbox
# HTTP API, public key, expect) are in workflows/common/ssh-best-practice.md → "Authentication".
umask 077; PW_FILE=$(mktemp); trap 'rm -f "$PW_FILE"' EXIT   # removed however the run ends
printf '%s' "$JOB_PASSWORD" > "$PW_FILE"                          # -f file, never -p on the command line
SSH_OPTS='-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30'
sshpass -f "$PW_FILE" scp $SSH_OPTS -P "$SSH_PORT" \
  ~/scratch/train.py "root@$SSH_HOST:/output/train.py"
```

**Critical scp flags** (these are the common LLM mistakes):

- `-P <port>` — **uppercase P** for port. `-p` in scp means "preserve mtime/mode", NOT port.
- The host is the **external** address from `links.ssh`. **Never** use `10.x.x.x` / `172.16-31.x.x` / `192.168.x.x` here — those are internal IPs from `references/openbayes-docs/gear/internal-ssh.md`, only valid for container-to-container transfer.
- `-o StrictHostKeyChecking=accept-new` to avoid first-time host-key prompts blocking the non-interactive script.

**Public-key alternative** (avoids `sshpass`):

1. Once: `bayes ssh upload ~/.ssh/id_rsa.pub` (uploads YOUR PUBLIC KEY, see `references/openbayes-docs/cli/reference/bayes-ssh-upload.md`).
2. Then scp without sshpass:
   ```bash
   scp -P "$SSH_PORT" ~/scratch/train.py "root@$SSH_HOST:/output/train.py"
   ```

For Mastra/HTTP-only sandbox upload, use `container-dev-quickref.md`. Use SSH/scp for files >50 MB.

## Phase 4 — Run training inside the workspace

After upload, recommend running the script in a tmux session with a persisted log because training, downloads, installs, and demos should survive SSH/Jupyter disconnects and remain inspectable later. Ask the user before using tmux unless they already requested it. Full runtime discipline: `workflows/common/workspace-runtime.md`.

```bash
sshpass -f "$PW_FILE" ssh $SSH_OPTS -p "$SSH_PORT" \
  "root@$SSH_HOST" "cd /output && mkdir -p logs && tmux new -d -s workspace-train 'python train.py 2>&1 | tee -a logs/train.log'"
```

Before replacing an existing session, inspect it with `tmux ls` and `tmux capture-pane -pt workspace-train:0.0 -S -80`. Report `workspace-train` and `/output/logs/train.log` back to the user.

If the user declines tmux, use a simpler command shape and explain the tradeoff:

```bash
# foreground, easiest to understand but dies if the shell disconnects
cd /output && mkdir -p logs && python train.py 2>&1 | tee -a logs/train.log

# background without tmux, harder to inspect or reattach
cd /output && mkdir -p logs && nohup python train.py > logs/train.log 2>&1 &
```

## Phase 5 — Wait for completion

Poll job status via `workflows/compute/inspect-job.md`. If the user accepted tmux, inspect the pane and persisted log:

```bash
tmux capture-pane -pt workspace-train:0.0 -S -80
tail -n 80 /output/logs/train.log
```

If the user declined tmux, inspect the log and process state:

```bash
tail -n 80 /output/logs/train.log
pgrep -af 'python train.py' || true
```

For services, also verify the expected port and readiness endpoint before returning a URL. Do not infer failure from quiet output alone; check logs, process state, and resource activity.

## Phase 6 — Download artifacts

```bash
sshpass -f "$PW_FILE" scp $SSH_OPTS -P "$SSH_PORT" \
  "root@$SSH_HOST:/output/best.pt" ~/Downloads/best.pt
```

## Phase 7 — Persistence (optional)

If the artifact should be reused across future jobs, after Phase 6 the user can promote `/output/best.pt` to a dataset version. Full recipe: `workflows/dataset/populate-version.md` Path A (move to RW-bound `/input{N}` then flip to RO).

## Anti-patterns

- **Using `bayes ssh upload` to transfer files.** That command uploads SSH **public keys**, not file content. See `references/openbayes-docs/cli/reference/bayes-ssh-upload.md`.
- **Using `bayes data upload` for code/checkpoints not destined for a dataset.** It uploads to dataset versions, not to the workspace filesystem. Use it only when the user explicitly wants a dataset.
- **Internal IPs in scp.** `10.x` / `172.16-31.x` / `192.168.x` only work container-to-container (see `references/openbayes-docs/gear/internal-ssh.md`). From the user's laptop you need the external `links.ssh` host.
- **Lowercase `-p` for scp port.** `-p` means "preserve mtime"; `-P` is the port flag. (For `ssh`, port IS lowercase `-p`. The two flags disagree.)
- **Launching workspace programs with `nohup` as the first recommendation.** Offer `tmux + tee` first so the pane and log both remain inspectable; use `nohup` only if the user declines tmux but still wants background execution.
- **Restarting or stopping a RUNNING workspace to get sandbox.** Missing `links.sandbox` is a transport limitation, not a reason to kill active work. Use SSH/scp, or create a new workspace when sandbox is required and the existing workspace is not explicitly assigned to this task.
- **Treating sandbox as the default in ordinary CLI work.** In a local Codex/CLI environment with SSH/scp available, SSH is the normal path; sandbox is mainly for Mastra workspace SDK, HTTP-only agents, or no-SSH-client environments.

## GraphQL Operations Used

- `workflows/common/bootstrap.md` → various
- `workflows/compute/list-jobs.md` → `LoadMyJobs`
- `workflows/compute/inspect-job.md` → `LoadJob`
- `workflows/compute/create-workspace.md` → `CreateJob`
