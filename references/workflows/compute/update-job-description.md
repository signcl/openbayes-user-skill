# Update Job Description

Use this workflow when the user wants to change a job's description.

## Goal

Update only the description field of an existing job using `updateJob`.

## Deterministic Steps

1. Normalize the request into `job.update.description`.
2. Require:
   - `userId`
   - `jobId`
3. Load `compute/load-job-context.graphql` to confirm the job exists and is visible.
4. Restate the target job id and the new description value.
5. Ask for confirmation.
6. Execute `compute/update-job-description.graphql` with `input: { description }`.
7. Read back the job to verify the description was updated.

## Guardrails

- Do not use `updateJob` for stop or restart.
- Do not use raw `node` updates.
- Only update the `description` field; do not mutate other fields in this workflow.

## Failure Translation

- permission denied -> the current user cannot manage this job

## GraphQL Operations

- `references/graphql-operations/compute/update-job-description.graphql`
- `references/graphql-operations/compute/load-job-context.graphql`
