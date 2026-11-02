# Workspace Runtime Practice

Use this guide when operating inside a running OpenBayes/HyperAI workspace or job container, especially when starting programs for the user.

This document only governs how a program should be launched, monitored, and reported once the target container is known. Use `references/workflows/common/container-dev-quickref.md` for container facts such as path mapping, storage persistence, sandbox availability, Jupyter links, ports, and CLI behavior.

## Goal

Keep programs alive across SSH/Jupyter disconnects, make progress observable, and leave the workspace in a state that another operator can inspect later.

## Recommendation And Confirmation

Recommend `tmux` for any command that starts a long-lived process, has uncertain duration, or would be expensive to restart. Before starting the command, tell the user why `tmux` helps and ask whether they want to use it, unless they have already explicitly asked for tmux.

Examples where `tmux` should be recommended:

- training, evaluation, batch inference, benchmark, data preprocessing
- model download, dependency installation, build, compile, index generation
- web UI/API startup such as Gradio, Streamlit, FastAPI, vLLM, or Jupyter-adjacent demos
- any command expected to run longer than 2 minutes
- any command where the user may come back later and ask for status

Direct one-shot execution is fine for short read-only checks such as `pwd`, `ls`, `python --version`, `nvidia-smi`, `du -sh`, `cat` on a small file, or a quick probe command.

If the user declines `tmux`, respect that choice:

- for foreground execution, run the command directly with `tee -a <log>` when logs matter
- for background execution without `tmux`, use `nohup ... > <log> 2>&1 &` only after warning that it is harder to inspect or reattach
- still report the log path, process check, and any readiness evidence

## Session Pattern

After the user accepts `tmux`, use stable, purpose-specific session names instead of a generic session when possible:

```bash
mkdir -p logs
tmux new -d -s workspace-train 'python train.py 2>&1 | tee -a logs/train.log'
tmux new -d -s workspace-demo 'python app.py 2>&1 | tee -a logs/demo.log'
tmux new -d -s workspace-install 'pip install --user -r requirements.txt 2>&1 | tee -a logs/install.log'
```

Prefer log paths under `/output` or the project working directory so they persist with the workspace:

```bash
mkdir -p logs
tmux new -d -s workspace-demo 'python app.py --host 0.0.0.0 --port 8080 2>&1 | tee -a logs/demo.log'
```

When replacing an existing session, inspect it first:

```bash
tmux ls
tmux capture-pane -pt workspace-demo:0.0 -S -80
```

Only kill a session after deciding it is stale or the user explicitly wants it stopped:

```bash
tmux kill-session -t workspace-demo
```

## Monitoring

When using tmux, inspect both the pane and persisted logs:

```bash
tmux capture-pane -pt workspace-demo:0.0 -S -80
tail -n 80 logs/demo.log
```

When not using tmux, inspect the log and process state:

```bash
tail -n 80 logs/demo.log
pgrep -af 'python app.py' || true
```

For services, verify the process and readiness marker before handing back a URL:

```bash
ss -tlnp | grep ':8080'
curl -fsS http://127.0.0.1:8080/health || true
```

Do not infer failure from a quiet pane or quiet log alone. Check logs, process state, open ports, GPU/CPU activity, and expected startup milestones.

## Reporting Back

When leaving a background process running, tell the user:

- tmux session name, or PID if the user declined tmux
- command or service started
- log file path
- latest observed milestone
- how to reattach or inspect (`tmux attach -t <session>` when using tmux)

Example:

```text
Started the demo in tmux session `workspace-demo`.
Logs: `/output/logs/demo.log`.
Reattach: `tmux attach -t workspace-demo`.
Latest check: port 8080 is listening and `/health` returned 200.
```

## Interaction With SSH And Sandbox

- If using SSH, also follow `references/workflows/common/ssh-best-practice.md`.
- If already operating via sandbox exec in a Mastra/HTTP-only/no-SSH context and the user accepts `tmux`, it is still valid to start long-running commands through a shell that creates a `tmux` session inside the container.
- For file upload/download, choose sandbox or SSH/scp using `references/workflows/compute/run-experiment-end-to-end.md`; this document only governs how programs should keep running once inside the container.

## Anti-Patterns

- Starting `python app.py` directly in a raw SSH shell for a service the user needs later without first recommending a safer run mode.
- Using `nohup` as the default without offering `tmux`; it hides interactive state and makes inspection harder.
- In tmux sessions, redirecting all output with `> log 2>&1` without `tee`; attached panes then look idle. This does not apply to the bare `nohup` fallback when the user declines tmux.
- Writing logs only outside `/output` when they need to survive workspace restart or later inspection.
