# Read Dataset Detail

Use this workflow when the user wants to inspect a specific dataset's metadata, versions, and permissions.

## Goal

Load a single dataset and translate its state into product language.

## Main Entity

- Primary aggregate root: `Dataset`
- Related version context: `DatasetVersion`

## Required Reads

Load the dataset detail snapshot via `dataset/dataset-read-detail.graphql`.

## Available Next Actions

This is read-only, but it should still surface what the user can do next:

- `dataset.canEdit`
- `dataset.canDestroy`
- `dataset.canUpdatePermissions`
- `dataset.canUpload`
- `datasetVersion.canBindJob` (model-serving only; not a generic mount gate — see `compute/clone-tutorial.md`)
- `datasetVersion.canDeployModelToJob`

## Intent to Query Mapping

- `dataset.read.detail` -> `userDatasetModelQuery` (`dataset/dataset-read-detail.graphql`)

## Deterministic Steps

1. Normalize the request into `dataset.read.detail`.
2. Require:
   - dataset identifier (id or owner + name)
3. Load `dataset/dataset-read-detail.graphql`.
4. Summarize:
   - dataset id and name
   - category
   - description and tags
   - permissions (`publicPermission`)
   - 数据集总大小用 `dataset.size`(`versions[].size` 是单版本大小)
   - versions (list with status and binding identifiers)
5. For model serving binding (MODEL one-click deploy), highlight versions where `canBindJob: true`. Do not surface this for generic "can mount in a job" questions — for those, see `compute/create-job.md`.
6. If helpful, expose next allowed actions from the entity snapshot.

## Guardrails

- Read-only; no confirmation required.
- Do not expose internal fields that are not user-relevant.

## GraphQL Operations

- `references/graphql-operations/dataset/dataset-read-detail.graphql`
