# Delete Dataset

Use this workflow when the user wants to permanently delete a dataset.

## Goal

Safely execute `DeleteDatasetMutation` after confirming the target and verifying deletion.

## Main Entity

- Primary aggregate root: `Dataset`

## Required Reads

Before mutation, load `dataset/dataset-read-detail.graphql` as the canonical dataset snapshot.

## Action Gates

Check these before deleting:

1. dataset must be visible to the current user
2. `dataset.canDestroy` when available is the primary delete affordance
3. explicit user confirmation is required because this is irreversible

## Intent to Query Mapping

- `dataset.delete` -> `DeleteDatasetMutation` (`dataset/dataset-delete.graphql`)

## Deterministic Steps

1. Normalize the request into `dataset.delete`.
2. Require:
   - dataset identifier
3. Load `dataset/dataset-read-detail.graphql` to confirm the dataset exists and display current state.
4. Restate the exact target: dataset id, name, owner, current versions, and permission state.
5. Ask for explicit confirmation.
6. Execute `dataset/dataset-delete.graphql`.
7. Perform read-back check: attempt to read the dataset and expect not-found.

## Confirmation

This is a destructive and irreversible operation. Before execution:

1. Restate the exact target (dataset id, name, owner).
2. List what will be permanently deleted (all versions and associated data).
3. Wait for explicit user confirmation.
4. After execution, perform read-back verification to confirm not-found.

## Guardrails

- Never delete without explicit confirmation.
- Never skip the read-back verification after deletion.

## Read-Back

After mutation, attempt to read the same dataset again with `dataset/dataset-read-detail.graphql` and expect not-found.

## Failure Translation

- permission denied -> the current user cannot delete this dataset
- not found -> the dataset does not exist or was already deleted

## GraphQL Operations

- `references/graphql-operations/dataset/dataset-delete.graphql`
- `references/graphql-operations/dataset/dataset-read-detail.graphql`
