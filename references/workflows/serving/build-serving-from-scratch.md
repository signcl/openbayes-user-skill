# Build a Serving from Scratch

Use this workflow when the user wants a model turned into a callable inference service but has no source job yet — "帮我把这个模型部署成 API"、"下了个 Qwen 想做成服务"、"从零部署一个模型".

This file is **routing only**. Every step below is owned by another document; the value here is the order.

## The chain

| Step | What happens | Follow |
|---|---|---|
| 1. Get the model into the warehouse | Search public models first; download only if uncollected | `common/explore-public-resources.md` → (miss) `dataset/download-model.md` |
| 2. Test it in a workspace (**recommended default**) | Create a workspace on the target resource with the model bound read-only, write `start.sh`, run it, and verify real inference responses on `8080` | Workspace creation: `compute/create-workspace.md`. Script + test procedure: `references/openbayes-docs/serving/01-getting-started.md` |
| 3. Deploy | Validate the source, stop the workspace if preflight marks the handoff mandatory (same resource, parallel limit would be exceeded), then create the serving | `serving/preflight-from-job.md` → `serving/create-serving.md` |
| 4. Verify | Control-plane readiness + data-plane probe | `serving/read-serving-status.md` |

## Step 2: recommend it, and mean it

Testing in the workspace is the path to recommend, and "test" means **thoroughly** — not that `start.sh` starts, but that real inference requests to `8080` come back correct. The workspace is the last place with a shell: a serving has none, every attempt is a cold start, and a failure gives you a log and nothing else. A bug that takes seconds to find at an `8080` prompt costs several failed rollouts to find afterwards. Tell the user that reasoning; do not flatten it to "建议先测一下".

It is still their call, and skipping is legitimate when the script is already proven — a redeploy, a script from a tutorial, a working setup moving to a new resource. Accept that without re-litigating. **A serving does not require a source job**: it requires that whatever is mounted at `/output` contains `start.sh`. A dataset carrying the script satisfies that as well as a workspace's output does (`create-serving.md` → "Constrained combinations"), and the console's serving-create page treats the source job as an optional prefill. When step 2 is skipped, preflight-from-job does not apply — go to `create-serving.md`, which carries the equivalent checks — and confirm the port switch (`8080` workspace / `80` when `OPENBAYES_SERVING_PRODUCTION` is set) directly, since it is the most common rollout failure and is normally authored in step 2.

## Where the agent's path differs from the docs page

`references/openbayes-docs/serving/01-getting-started.md` is written for a human clicking the console. Two adjustments:

- **Step 2 setup**: the docs say "在页面上创建模型训练并选择算力/镜像/数据绑定". The agent uses `compute/create-workspace.md` (GraphQL `createJob`) instead of describing console clicks. Take the resource/runtime/binding *choices* from the docs page; take the *mechanics* from the workflow.
- **Step 3 deploy**: the docs offer 「一键部署」 and 「手动创建」. From a job, the agent goes through `preflight-from-job.md` — it enforces what the console's one-click path enforces implicitly (resource lock, readonly binding conversion, `/output/start.sh`, port switch), and its output is what `create-serving.md` needs.

The docs page owns the `start.sh` template, the in-container curl test, and the online-test tool — read it when the user needs the script; do not restate it here.

## Guardrails

- Do not skip the public-model gate in step 1 — see `dataset/download-model.md`.
- Recommend step 2 clearly and for the right reason (debugging a serving is expensive) — but do not present it as mandatory. Both failures are real: forcing it, and letting a user walk into a serving rollout with an untested script because you never made the case.
