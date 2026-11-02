# Update Project Tags

Use this workflow to add, remove, replace, or switch a Project's assignments to existing Resource Tags. Apply `references/concepts/resource-tags.md` in full.

## Intent to Query Mapping

- `project.tags.add/remove/replace` -> `ProjectUpdateTags` (`compute/project-update-tags.graphql`)

## Deterministic Steps

1. Bootstrap to obtain `me.roles`.
2. Load `common/load-tag-catalog.graphql` and `compute/load-project-context.graphql`.
3. Apply the canonical authorization, classification, target-set, confirmation, and read-back rules. Use `project.owner.id` as `ownerId`.
4. Require the target to contain exactly one of `BUSINESS_CHANNEL_ML` and `BUSINESS_CHANNEL_HPC`; a channel switch must be explicit.
5. Execute `compute/project-update-tags.graphql` with the complete `[String!]` target shown in `project-update-tags.vars.md`.
6. Read back with `load-project-context.graphql` and require exact set equality.

## Controlled `public` Transition

Use the canonical Public Listing sequence with `compute/project-update-permissions.graphql`.

## GraphQL Operations

- `references/graphql-operations/common/load-tag-catalog.graphql`
- `references/graphql-operations/compute/load-project-context.graphql`
- `references/graphql-operations/compute/project-update-tags.graphql`
- `references/graphql-operations/compute/project-update-tags.vars.md`
- `references/graphql-operations/compute/project-update-permissions.graphql`
