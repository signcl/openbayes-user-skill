# Storage Semantics

Shared reference for storage impact and quota considerations across all workflows involving data binding, job creation, and public resource usage.

## Storage Quota Overview

Users have a default 50GB storage quota. All data persisted on the platform (data warehouse uploads, workspace data, job outputs) counts toward this total. Query current usage via `common/load-quota.graphql`:

- `storageQuota.currentUsedMegaBytes` — current usage
- `storageQuota.totalMegaBytes` — total allowance (free + subscribed)
- `storageQuota.remainMegaBytes` — remaining

When `remainMegaBytes` is low, proactively warn the user before operations that consume storage.

### Display convention — match the console (1024-base, labeled "GB")

To stay consistent with what the user sees in the console UI, **convert these `*MegaBytes` values to GB by dividing by 1024, and label the result "GB"** — e.g. `totalMegaBytes / 1024 → "50 GB"`. The default quota of 51200 `MegaBytes` is shown as **50 GB**, not 51.2 GB.

This is the **1024-base (binary)** convention: the console computes every storage figure with a 1024 divisor but labels it with decimal-style units ("GB"/"MB", never "GiB"/"MiB"). So a "GB" you show the user is technically a GiB. Always divide by 1024, never 1000 — dividing by 1000 would put your number out of step with the console (and with the storage plans, whose `megabytes` are also 1024-base, e.g. a "20 GB" add-on = 20480). The same `/1024`, "GB"-labeled rule applies to dataset/model version sizes and `/output` usage.

> Note: this is **separate** from the cluster-resource creation rule in the admin-infra skill, where the `memory` (MB) and `diskSize` (GB) provisioning inputs are deliberately **1000-base**. That governs how a node/resource is *provisioned*; this governs how a user's *storage* is *displayed*. Don't cross-apply them.

## What Consumes Storage

| Operation | Storage Impact |
|---|---|
| Upload data to data warehouse | Consumes storage quota |
| Create new data in workspace (`/output`) | Consumes workspace capacity (fixed per resource type) |
| Save workspace output as dataset version | Consumes storage quota |
| Delete datasets/versions or containers/jobs | Releases storage |

## Data Binding Storage Rules

| Binding Mode | Mount Path | Quota Impact |
|---|---|---|
| Read-only, public dataset/model | `/input*` | **None** — mounted as reference, not copied |
| Read-only, own/org dataset | `/input*` | None — data already in user's warehouse |
| Read-write | `/input*` | Writes go to user's data warehouse, consuming warehouse quota |
| Bind to working directory | `/output` | Involves data copy, consumes workspace capacity |

Key guidance:

- Default `bindingAuth` to `READ_ONLY` unless the user explicitly needs writable access.
- Workspace capacity is fixed per resource type (e.g., 50GB for RTX 3090). When capacity is tight, suggest read-write binding to a data warehouse at `/input*` instead of writing to `/output`.
- When recommending public datasets/models, mention the storage advantage: read-only binding is free.
- Public resources are not copied to workspace when bound read-only — they are mounted by reference. The user benefits from this even for very large models.

## Quota Check Timing

Check storage quota (`common/load-quota.graphql`) in these situations:

- Before `create-job` or `clone-tutorial` when the user has large writable bindings or plans to generate significant output.
- Before `create-dataset` or dataset version upload when the payload is large.
- When the user asks about their remaining space or why an operation failed with a storage error.

Quota is informational — present it to help the user plan, but do not hard-gate on it (the server enforces limits).

## Failure Translation

- Storage quota exceeded → "存储空间不足，当前已使用 X / Y GB。建议删除不需要的数据集版本或执行记录来释放空间，或订阅更大的存储空间。"
- Workspace capacity full → "工作空间容量已满（X GB），建议将大文件写入通过读写绑定挂载的数据仓库（`/input*`），而不是工作目录（`/output`）。"
- 绑定 dataset 后工作目录内容"消失" → 把 dataset version 绑到了 `/output`。`/output` 就是工作目录本身（`/openbayes/home` / `/hyperai/home` 都是 `/output` 的软链），任何外部 dataset 绑到 `/output` 都会替换工作目录内容。要缓存 `/output` 产物到 dataset，请改用 `/input{N}` 上的 RW 绑定——参考 `references/workflows/dataset/populate-version.md`。

## GraphQL Operations

- `references/graphql-operations/common/load-quota.graphql`
