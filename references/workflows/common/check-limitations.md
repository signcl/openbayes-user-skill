# Check Limitations

Shared preflight for resource and entity limits. Run before any create or restart operation.

## Data Source

Query `party(id)` via `references/graphql-operations/common/load-party-context.graphql`.

`Party` is the unified identity type. Both `User` and `Org` are subtypes of `Party` and share the same `limitations` structure. When you already have a `username`, use `load-user-context.graphql`; when you have an `orgId`, use `load-org-context.graphql`. All three return the same `limitations` shape.

## Limitations Structure

```
party.limitations {
  quota { uploadSizeLimit }
  jobs { cacheCount, workspaceAvailableHours (deprecated) }
  dataset { publicItem { current, limit }, privateItem { current, limit } }
  project { publicItem { current, limit }, privateItem { current, limit } }
  resources [{ key, value { current, limit, freeCount } }]
  gpus [{ key, value { current, limit } }]
  unfinishedSnapshots { current, limit }
}
```

## Resource Parallel Limit (compute + serving)

Applies to: `create-job`, `restart-job`, `create-serving`, `create-serving-version`

Check `limitations.resources` for the selected resource name:

- Find the entry where `key` matches the selected resource (e.g., `rtx-4090`).
- If `freeCount == 0` (or `current >= limit`) -> blocked.
- User-facing message: "资源 X 超出个人限制".

Distinguish this from the **cluster** limit error "资源 [X] 超出集群限制" (en:
"Resource [X] exceeds cluster limit"): that one means the cluster itself has no
free slots for the resource — capacity is consumed across all tenants, not by
this user alone. It is not fixable from the user's side: explain that the
cluster is currently full and the only options are waiting and retrying later,
or choosing a different resource type. Do not tell the user to raise their
quota — quota is not the blocker there.

Also check `limitations.gpus` for the corresponding GPU type:

- Find the entry where `key` matches the GPU type.
- If `current >= limit` -> blocked.

## Workspace Hours (deprecated)

`limitations.jobs.workspaceAvailableHours` is a leftover of a deprecated
feature, **not** a gate — do not consult it in feasibility judgments.
Server-side enforcement was not re-measured; the field is ignored per the
platform deprecation ruling (#65).

## Dataset Count Limit (dataset)

Applies to: `create-dataset`

Check `limitations.dataset`:

- For public datasets: if `publicItem.current >= publicItem.limit` -> blocked.
- For private datasets: if `privateItem.current >= privateItem.limit` -> blocked.

## Project Count Limit (compute)

Applies to: `create-project`

Check `limitations.project`:

- For public projects: if `publicItem.current >= publicItem.limit` -> blocked.
- For private projects: if `privateItem.current >= privateItem.limit` -> blocked.

## Failure Translation

Translate limit violations into product language:

- Resource parallel limit: "资源 X 超出个人限制" (resource X exceeds personal limit)
- GPU parallel limit: "GPU 类型 X 超出个人限制"
- Dataset count: "数据集数量已达上限"
- Project count: "项目数量已达上限"

One related message is **not** derivable from `limitations` and only appears as a
server-side error on create/restart: "资源 [X] 超出集群限制" (Resource [X] exceeds
cluster limit). Translate it as cluster-wide capacity exhaustion — see the
distinction in "Resource Parallel Limit" above: advise waiting and retrying or
switching resource type, and do not suggest raising quota.

Always present the specific limit values (`current`/`limit`) so the user can understand the gap.
