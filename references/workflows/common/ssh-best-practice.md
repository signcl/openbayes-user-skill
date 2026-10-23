# SSH Best Practice

Use this guide when operations continue through `job.links.ssh` after create, restart, or troubleshooting flows.

## Goal

Reduce interruption risk, avoid false timeout failures, and keep progress observable for remote operations.

## Long-Task Heuristic

Treat an operation as long-running when any one of these conditions is true:

- expected duration is longer than 2 minutes
- duration is uncertain and may exceed 1 minute
- progress must be judged from logs or milestones
- interruption causes expensive rerun or partial-state cleanup

## Recommended Execution Pattern

1. Load current job context first and confirm `links.ssh` exists.
2. Connect with the provided SSH command from `links.ssh`, wrapped per the Authentication section — never a bare `ssh` from a tool without a terminal.
3. For long-running tasks, recommend a tmux session before execution and ask the user whether to use it.
4. If the user accepts, prefer `tmux + tee` so progress is visible in the pane and persisted to a log file.
5. If the user declines, run foreground with `tee` when practical; use `nohup` only when they still need background execution without tmux.
6. Track progress using logs and milestone checks.
7. If using tmux, tell the user how to reattach if the SSH client disconnects.

## Preferred Long-Task Command Shape

For workspace programs and services, prefer the fuller guide in `references/workflows/common/workspace-runtime.md`. This page covers SSH-specific transport and auth details.

Recommend this pattern for long-running commands:

```bash
mkdir -p logs
tmux new -d -s workspace-task 'your_command 2>&1 | tee -a logs/task.log'
```

Examples:

```bash
mkdir -p results
tmux new -d -s workspace-benchmark 'bash run_benchmark.sh 2>&1 | tee -a results/run.log'
mkdir -p logs
tmux new -d -s workspace-train 'python train.py --config config.yaml 2>&1 | tee -a logs/train.log'
```

Why this is recommended:

- the tmux pane shows live progress when attached
- the same output is preserved in a log file for later inspection
- reconnecting users can inspect either the pane or the log without losing context

Avoid this as the first recommendation for long tasks:

```bash
tmux new -d -s workspace-task 'your_command > path/to/log 2>&1'
```

This keeps the log but often makes the tmux pane appear blank when attached, which looks like a hang even when the task is healthy.

## Authentication — feed the password non-interactively, or do not connect

`links.ssh` is `ssh root@<host> -p<port>` and the container authenticates by
**password** (`Job.password`) unless a public key of the user's is installed.
`ssh` and `scp` take that password from the controlling terminal only — never
from stdin, never from an env var. From an agent's shell tool a bare
`ssh`/`scp` therefore either **hangs at `password:` with no output until the
tool's timeout kills it** (tool attached to a terminal — a 60 s `scp` timeout
looks like a transfer that never started) or, with no terminal at all, fails
in about a second with three `Permission denied, please try again.` lines.
Neither is a gateway fault. Treat every `ssh` / `scp` / `rsync` command as
blocked until you have chosen one of the paths below.

Treat `Job.password` as sensitive throughout: keep it in a `0600` file or a
shell variable, never on a command line (it would show in `ps` and in tool
logs), never in status summaries, and reveal it only when the user asks.
It is the container login password, not a platform credential: for a
connection the user asked for, use it without a separate approval, and keep
password-bearing links out of routine query output.

Options for every command in this file:

```bash
SSH_OPTS='-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30'
```

`accept-new` avoids the first-time host-key prompt (another silent hang);
`ServerAliveInterval` keeps idle long commands from being dropped by the
gateway. If the user's `~/.ssh/config` sets `ControlMaster` for `Host *`, one
authenticated session leaves a multiplexed master open for later commands —
a later "bare" `ssh` that unexpectedly works is riding that, not the password.

### Step 0 — detect `sshpass`

```bash
command -v sshpass >/dev/null && echo has-sshpass || echo no-sshpass
```

macOS ships without it; most Linux images do too.

### With `sshpass`

```bash
umask 077; PW_FILE=$(mktemp); trap 'rm -f "$PW_FILE"' EXIT; printf '%s' "$JOB_PASSWORD" > "$PW_FILE"
sshpass -f "$PW_FILE" ssh $SSH_OPTS -p <port> root@<host> 'ls -l /output'
sshpass -f "$PW_FILE" scp $SSH_OPTS -P <port> <local> root@<host>:/output/
```

The `trap` removes the password file however the shell exits — a failed
upload or a killed run must not leave the live credential on disk.

`-f <file>`, not `-p "$JOB_PASSWORD"` — the latter puts the password in the
process list.

### Without `sshpass`

Do not run the bare command hoping it works. If you need to prove the
gateway is reachable, make it fail fast instead of hang:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 $SSH_OPTS -p <port> root@<host> true
# → root@<host>: Permission denied (publickey,password,keyboard-interactive).
```

`BatchMode=yes` forbids the prompt, so the command returns in about a second
with that line and exit status 255 — the expected outcome, meaning "reachable,
password needed". Then pick, in this order:

1. **Ask the user to install `sshpass`** and use the block above:
   `brew install hudochenkov/sshpass/sshpass` (macOS, tap), `apt install
   sshpass` (Debian/Ubuntu), `dnf install sshpass` (Fedora). Do not install
   it on the user's machine without asking.
2. **`links.sandbox` present → skip SSH.** The Sandbox HTTP API authenticates
   with `Authorization: Bearer <Job.password>` — no prompt, no `sshpass` — and
   covers file read/write up to ~50 MB and command execution:
   `workflows/common/container-dev-quickref.md` → "Sandbox HTTP API".
3. **Register the user's public key with the platform.** The container's
   `sshd` looks keys up on the platform at every login
   (`AuthorizedKeysCommand`): a key registered on the platform logged into
   an **already-running** workspace within seconds, no restart, and it
   applies to every later workspace too. The user registers it in the
   console («SSH 设置») or with `bayes ssh upload ~/.ssh/id_ed25519.pub`
   (`references/openbayes-docs/gear/ssh.md`); the package carries no
   template for it. After that, plain `ssh`/`scp`/`rsync` with
   `-o BatchMode=yes` just work. This is the durable fix. If they have no
   key pair, `ssh-keygen -t ed25519 -N ''` with their consent.
4. **`expect` as the last resort** — `/usr/bin/expect` ships with macOS and
   most Linux. Good for one-off `ssh '<command>'`; the command's exit status
   comes back through `expect`. Two constraints: **stdin does not reach the
   remote command** (`cat file | expect … 'cat > remote'` hangs), and `scp`
   would prompt once per file, so move file content *inside the command*.

   ```bash
   # usage: ssh_pw.exp <pwfile> <port> <host> '<remote command>'
   cat > ssh_pw.exp <<'EOF'
   #!/usr/bin/expect -f
   set timeout -1
   set f [open [lindex $argv 0] r]; set pw [string trim [read $f]]; close $f
   lassign $argv _ port host cmd
   spawn ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -p $port root@$host $cmd
   expect {
     -re {[Pp]assword:} { send -- "$pw\r"; exp_continue }
     eof
   }
   lassign [wait] pid spawnid os_err rc
   exit $rc
   EOF
   umask 077; PW_FILE=$(mktemp); trap 'rm -f "$PW_FILE"' EXIT; printf '%s' "$JOB_PASSWORD" > "$PW_FILE"
   expect -f ssh_pw.exp "$PW_FILE" <port> <host> 'ls -l /output'

   # small file: content travels inside the command, then verify (File Transfer section)
   B64=$(base64 < <local> | tr -d '\n')
   expect -f ssh_pw.exp "$PW_FILE" <port> <host> "echo $B64 | base64 -d > /output/<name>; ls -l /output/<name>"
   ```

   With `expect` available you can also make path 3 self-service for the
   current run only: append the user's key to the container's
   `~/.ssh/authorized_keys`. **Append with a leading newline** — the file
   already holds a platform-injected key with no trailing newline, and a
   plain `>>` glues the two into one unparseable line that breaks *both*:

   ```bash
   KEY=$(cat ~/.ssh/id_ed25519.pub)
   expect -f ssh_pw.exp "$PW_FILE" <port> <host> "printf '\n%s\n' '$KEY' >> ~/.ssh/authorized_keys"
   ssh -o BatchMode=yes $SSH_OPTS -p <port> root@<host> 'echo key-ok'
   ```

   This lasts until the workspace restarts; the platform upload in path 3
   does not.

### Password-login failures

If a password path is in place and login still fails, re-read `Job.password`
from job context and retry once — under `expect` a wrong password comes back
as `Permission denied` within a second, not as a hang. Do not loop on it.

## File Transfer

**A dropped transfer does not reliably exit non-zero.** `scp` over this gateway
can die mid-stream and leave a truncated or zero-byte file at the destination,
so the failure surfaces later and somewhere else — a `400` from an app handed a
broken image, a decode error, a model that loads and emits garbage. This is the
one thing about transfers worth remembering.

So: **verify at the destination before using the file** (`ls -l`, checksum if it
matters). Zero bytes means the transfer died, not that the file was empty.

**Carry the port into every command.** `links.ssh` is
`ssh root@ssh.openbayes.com -p<port>` — never 22 — and the flag is spelled
differently per tool. Copying `-p` across from the `ssh` command is the usual
mistake: on `scp` that means "preserve times" and the connection silently goes
to 22.

```bash
# $PW_FILE / $SSH_OPTS as set up in the Authentication section; with a
# registered public key, drop the `sshpass -f "$PW_FILE"` prefix and add -o BatchMode=yes.
sshpass -f "$PW_FILE" ssh  $SSH_OPTS -p <port> root@<host> 'ls -l <remote>'
sshpass -f "$PW_FILE" scp  $SSH_OPTS -P <port> <local> root@<host>:<remote>          # capital P
sshpass -f "$PW_FILE" rsync -avP --partial -e "ssh $SSH_OPTS -p <port>" <local> root@<host>:<remote>
cat <local> | sshpass -f "$PW_FILE" ssh $SSH_OPTS -p <port> root@<host> 'cat > <remote>'
```

For `rsync` the ssh options go inside `-e`, and `sshpass` wraps `rsync`
itself. A bare command here hangs exactly like a bare `ssh`.

When a transfer does fail, in order: shrink the payload (re-encode, downscale,
`tar` many small files into one), retry, `rsync --partial` for anything large,
then the `cat`-over-ssh form when `scp` keeps dying but the session is healthy.
If you script the retry, make the loop exit non-zero when the last attempt
fails — otherwise the trailing `sleep` becomes the exit status and automation
continues as if the file arrived.

Better than transferring at all: have the job write to `/output` and collect it
through the data warehouse (`workflows/dataset/populate-version.md`) — checking
first that `/output` has room, since workspace capacity is fixed per resource
type (`workflows/common/storage-semantics.md`).

No SSH at all (Mastra / HTTP-only)? That is a different transport, not a
fallback for a flaky `scp`: use the sandbox upload path in
`workflows/common/container-dev-quickref.md` → "Sandbox HTTP API", which is
itself capped around 50 MB — above that, SSH/scp is the only option.

## tmux Quick Commands

```bash
tmux new -s workspace-task
tmux attach -t workspace-task
tmux ls
tmux kill-session -t workspace-task
```

Useful monitoring commands:

```bash
tmux capture-pane -pt workspace-task:0.0 -S -50
tail -f path/to/log
```

## Timeout Policy

- Use short connect timeout only for SSH connectivity checks.
- Do not use a short fixed command timeout to conclude startup failure.
- Prefer milestone-based checks, for example:
  - process started
  - model shards loading
  - serving or runtime ready markers

## Reporting Pattern

When reporting status to the user, include:

- current stage
- latest stable milestone
- evidence line from logs
- next checkpoint and expected wait range

## Operator Notes

- If the user attaches to tmux and sees little or no output, first check whether the command is currently in a sleep or wait phase before treating it as stuck.
- Warn users that sending `Ctrl-C` into the attached tmux pane will interrupt the foreground task.
- For short, read-only checks (`pwd`, `ls`, one-shot metadata query), tmux is optional.
- If the user says they do not want tmux, do not argue; switch to the best non-tmux command shape and make the monitoring limitations explicit.

## Notes

- This guide is recommendation-oriented and should be applied with operator judgment.
