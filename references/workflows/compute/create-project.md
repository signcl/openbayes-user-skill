# Create Project

Use for direct Project creation or a new Project in job creation.

## Deterministic Steps

1. Resolve owner context with `common/load-party-context.graphql`.
2. Run limitations check per `references/workflows/common/check-limitations.md`:
   - Project count limit (`limitations.project.publicItem` or `privateItem`).
3. Apply `references/concepts/resource-tags.md`:
   - Default/explicit ML or no channel: omit `tagNames`; the server defaults ML.
   - Only affirmative HPC selects `BUSINESS_CHANNEL_HPC`; negated/discussed HPC does not. Ask only for conflicting intent.
   - `openbayes` supports HPC. Elsewhere, continue only after the user confirms an **HPC** / **高性能计算** left-navigation entry.
4. Do not load the Tag Catalog. Reject Ordinary, Controlled, Unclassified, or invented tags; assign them after creation.
5. Confirm name and owner; for HPC, also show its localized name.
6. Execute `compute/create-project.graphql`:
   - Default ML path: omit `tagNames`.
   - Affirmative HPC path: send `[{ "name": "BUSINESS_CHANNEL_HPC" }]`.
7. Read back the expected channel. On mismatch, report without repair, recreation, or fallback.

Localize channel names; hide raw values.

## Failures

- Never use admin scope.
- permission denied -> cannot create Project
- project count limit -> "项目数量已达上限"
- HPC unavailable -> ask the user to verify the left-navigation entry; no ML fallback

## GraphQL Operations

- `references/graphql-operations/compute/create-project.graphql`
- `references/graphql-operations/common/load-party-context.graphql`
