# Resource Tags — Dataset and Project Assignment

Resource Tags are platform-defined metadata associated with a Dataset or Project. This capability manages associations with existing catalog entries; it does not manage the Tag Catalog itself.

## Scope

Supported intents are: inspect current assignments, list assignable catalog entries, add, remove, explicitly replace ordinary assignments, and filter resources where the schema supports tag filters.

Never call `createNewTag`, `updateTag`, or `deleteTag`. Outside the fresh-Project channel contract below, a name that is absent from the catalog is an error, not an invitation to create a tag through a Dataset or Project mutation.

Jobs do not own independent Resource Tags. `CreateJobInput.tagNames` carries Project Tag Context only when the create flow also creates a Project.

## Classification Policy

Classify exact catalog names in this order:

| Class | Rule | Assignment authority | Propagation |
|---|---|---|---|
| Controlled Tag | Exact name `public` | resource `canEdit` and `me.roles` contains `ADMIN` | never automatic |
| Business Channel Tag | Exact name `BUSINESS_CHANNEL_ML` or `BUSINESS_CHANNEL_HPC` | normal Project create/update policy | the only automatic clone/copy allowlist |
| Ordinary Tag | `reserved=false`, `published=true`, `editable.name=ALLOW_USER_UPDATE`, and `hidden.name=USER_VISIBLE` | resource `canEdit` | never automatic |
| Unclassified Tag | every other existing catalog entry | no mutation until an explicit policy is documented | never automatic |

Catalog flags do not turn a reserved tag into an administrator tag by inference. Known semantic names win; all special unknown combinations fail closed.

## Catalog Validation

Use catalog validation for existing resources and non-channel assignments. Fresh Project creation skips catalog channel selection.

1. Read `common/load-tag-catalog.graphql` with `include: ALL` and `type: LIST`.
2. Match requested names exactly and case-sensitively.
3. Offer close catalog names for a typo, but do not silently normalize or substitute.
4. Deduplicate exact requested names before computing a target set.

## Business Channel Default

For fresh Project creation:

- Default or explicit ML: omit `tagNames`; the server applies ML.
- Affirmative HPC: send one `BUSINESS_CHANNEL_HPC` `TagInput`. Negated or merely discussed HPC is not affirmative; ask only for conflicting intent.
- `openbayes` supports HPC. Elsewhere, say HPC is normally unavailable and continue only if the user confirms a left-navigation **HPC** / **高性能计算** entry. Catalog presence is not a feature flag.

Read back the expected channel. On mismatch, report without tag repair, recreation, or fallback.

Raw `BUSINESS_CHANNEL_*` names are payload-only. User-facing text uses localized names:

- `BUSINESS_CHANNEL_ML` -> 模型训练 (Chinese) / Model Trainings (English)
- `BUSINESS_CHANNEL_HPC` -> 高性能计算 (Chinese) / HPC (English)

## Tag Set Replacement

`replace` means explicit request to recompute only the Ordinary Tag partition to a full requested set. Controlled Tags change only when explicitly named in an admin-authorized change. Unclassified Tags are always preserved until an explicit policy classifies them.

## Assignment Intents

- **Add**: current set union requested Ordinary Tags.
- **Remove**: current set minus explicitly requested tags within the actor's authority.
- **Replace**: replace the Ordinary Tag partition only. Preserve Controlled and Unclassified Tags; on Project also preserve the Business Channel Tag.

Always compute a complete target set from a fresh resource snapshot. Confirmation shows three groups: preserved, added, and removed. Arrays sent to mutations are complete desired sets, never deltas; ordering is not meaningful.

Dataset may have zero Ordinary Tags. Project must retain exactly one Business Channel Tag. A missing or multiple-channel Project is an invalid existing state: stop and ask the user to choose ML or HPC rather than guessing.

## Authorization

Every mutation requires the resource's top-level `canEdit=true`. Do not substitute `permissions.canWrite` and do not derive mutation authority from owner or org roles.

`public` additionally requires platform role `ADMIN` in `me.roles`. Administrator identity never overrides `canEdit=false`.

## Public Listing

`publicPermission=PUBLIC_READ` grants direct-link read access. The Controlled Tag `public` adds discoverability on public listing pages. A public listing requires both.

- Add `public`: first establish `PUBLIC_READ`, respecting organization permission coupling, then assign the tag.
- If the tag step fails, read back and report the partial state. Compensate only through an atomic compare-and-set that checks current permission values; otherwise do not write. Current permission mutations provide no such guard, so never auto-restore.
- Remove `public`: remove only discoverability. Keep `publicPermission` unchanged unless the user explicitly asks to withdraw access.
- Remove `public` and make private: remove the tag and verify it first, then lower permission.

Each step is separately read back. Confirmation names the sequence and partial-failure state.

## Tag Propagation

Clone, copy, rerun-to-new-project, and create-with-`projectName` propagate only the source channel:

- Source ML: omit `tagNames`.
- Source HPC: automatically send one inherited HPC `TagInput`, overriding direct-create vendor gating.

If inherited HPC creation fails, report the exact failure; never retry or fall back with ML.

Never propagate `public`, Ordinary Tags, or Unclassified Tags, even when the current token has `ADMIN`. If the source has zero or multiple Business Channel Tags, stop for an explicit ML/HPC choice.

## Query Support

| Read intent | Native support |
|---|---|
| Current Dataset tags | `dataset(datasetId) { tags { name } }` |
| Current Project tags | `project(projectId) { tags { name } }` |
| Tag Catalog | `tags(include: ALL, type: LIST)` |
| Public Dataset/Project filter | native `tagNames: [String!]` |
| Party Project filter | native `party.projects(tagNames: ...)` |
| Party Dataset filter | no `tagNames` argument |

For party Dataset filtering, explain the schema limitation. Only when the user explicitly requests a bounded fallback may the workflow paginate all accessible Dataset pages and filter returned `tags[].name` client-side.

## GraphQL Input Shapes

| Operation | Shape |
|---|---|
| Create Dataset | `[TagInput]`, e.g. `[{ "name": "vision" }]` |
| Create Project | omit `tagNames` for default ML; one HPC `[TagInput]` only for affirmative/inherited HPC |
| Update Dataset | `UpdateDatasetInput.tagNames: [TagInput]` |
| Update Project | `UpdateProject.tagNames: [String!]` |
| Dataset/Project filters | `[String!]` |
