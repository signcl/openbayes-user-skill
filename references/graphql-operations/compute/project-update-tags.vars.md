# project-update-tags variables

`$tagNames` is a required `[String!]!` variable and cannot be omitted or null. It is the complete target defined by `references/concepts/resource-tags.md`, never a delta. Example:

```json
{
  "ownerId": "owner-id",
  "projectId": "project-id",
  "tagNames": ["BUSINESS_CHANNEL_HPC", "vision"]
}
```

Project create uses `[TagInput]`; this update uses strings.
