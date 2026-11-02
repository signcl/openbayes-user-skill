# List Resource Tags

Read `references/concepts/resource-tags.md` before describing Tag Catalog entries or Dataset / Project assignments.

## Reads

- Catalog: `common/load-tag-catalog.graphql` with `include: ALL`, `type: LIST`.
- Dataset: `dataset/dataset-read-detail.graphql`; return `tags[].name` and `canEdit`.
- Project: `compute/load-project-context.graphql`; return `tags[].name` and `canEdit`.

This workflow is read-only and needs no confirmation. Skip bootstrap for a public catalog read; bootstrap when current-user capability affects the answer.

## GraphQL Operations

- `references/graphql-operations/common/load-tag-catalog.graphql`
- `references/graphql-operations/dataset/dataset-read-detail.graphql`
- `references/graphql-operations/compute/load-project-context.graphql`
