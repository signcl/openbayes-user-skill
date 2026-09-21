# Create Dataset

Use this workflow when the user wants to create a new dataset.

## Goal

Create a dataset under the user's scope with the requested metadata and safe tag assignment.

## Intent to Query Mapping

- `dataset.create` -> `CreateDatasetMutation` (`dataset/dataset-create.graphql`)

## Deterministic Steps

1. Normalize the request into `dataset.create`.
2. Resolve owner context with `common/load-party-context.graphql`.
3. Run limitations check per `references/workflows/common/check-limitations.md`:
   - Dataset count limit (`limitations.dataset.publicItem` or `privateItem`).
4. Collect name, category, description, existing-tag requests, and permission/listing intent.
5. Apply `references/concepts/resource-tags.md`: validate requested Ordinary Tags with `common/load-tag-catalog.graphql` and send them as `[TagInput]`.
6. Confirm, execute `dataset/dataset-create.graphql`, and read back with `dataset/dataset-read-detail.graphql`.
7. For explicit public listing, create first and then use `update-dataset-info.md`'s canonical controlled transition as a separate confirmed step.

## Guardrails

- Always confirm before mutation.
- Always read-back after write to verify effect.

## Failure Translation

- permission denied -> the current user cannot create a dataset
- dataset count limit -> "数据集数量已达上限"

## GraphQL Operations

- `references/graphql-operations/dataset/dataset-create.graphql`
- `references/graphql-operations/dataset/dataset-read-detail.graphql`
- `references/graphql-operations/common/load-party-context.graphql`
