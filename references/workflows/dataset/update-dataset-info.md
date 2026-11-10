# Update Dataset Info

Use this workflow to update Dataset metadata or assignments to existing Resource Tags. Apply `references/concepts/resource-tags.md` in full for every tag change.

## Intent to Query Mapping

- `dataset.update.info` -> `UpdateDatasetInfoMutation` (`dataset/dataset-update-info.graphql`)

## Deterministic Steps

1. Load `dataset/dataset-read-detail.graphql` for the target.
2. Metadata-only change: restate exact fields, confirm, execute `dataset-update-info.graphql`, and read back.
3. Tag change: normalize add/remove/replace; bootstrap roles and load `common/load-tag-catalog.graphql`; apply the canonical policy using `dataset.owner.id` as `ownerId`.
4. Confirm the canonical preserved/added/removed diff and complete target. Send `[TagInput]` via `dataset-update-info.vars.md`, then read back and require exact equality.
5. Controlled `public`: use the canonical Public Listing sequence with `dataset-update-permissions.graphql`.

Do not combine an unreviewed tag array with a metadata-only update.

## GraphQL Operations

- `references/graphql-operations/dataset/dataset-update-info.graphql`
- `references/graphql-operations/dataset/dataset-read-detail.graphql`
- `references/graphql-operations/common/load-tag-catalog.graphql`
- `references/graphql-operations/dataset/dataset-update-permissions.graphql`
- `references/workflows/dataset/update-dataset-permissions.md`
- `references/graphql-operations/dataset/dataset-update-info.vars.md`
