# Create Empty Dataset Version

Use this workflow when the user wants to add a new empty version to an existing dataset.

## Goal

Create an empty version for a dataset, suitable for subsequent data upload or binding preparation.

## Intent to Query Mapping

- `dataset.version.createEmpty` -> `CreateEmptyVersion` (`dataset/dataset-version-create-empty.graphql`)

## Deterministic Steps

1. Normalize the request into `dataset.version.createEmpty`.
2. Require:
   - dataset identifier
3. Load `dataset/dataset-read-detail.graphql` to confirm the dataset exists.
4. Restate the target dataset id/name and the intent to create an empty version.
5. Ask for confirmation.
6. Execute `dataset/dataset-version-create-empty.graphql`.
7. Verify the returned `version`, `status`, and semantic binding identifier for downstream data binding.

## Guardrails

- Always confirm before mutation.
- Always verify the returned version after creation.

## GraphQL Operations

- `references/graphql-operations/dataset/dataset-version-create-empty.graphql`
- `references/graphql-operations/dataset/dataset-read-detail.graphql`
