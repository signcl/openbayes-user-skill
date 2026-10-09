# dataset-update-info variables

`UpdateDatasetInput.tagNames` is the complete `[TagInput]` target defined by `references/concepts/resource-tags.md`, never a delta. Example:

```json
{
  "ownerId": "owner-id",
  "datasetId": "dataset-id",
  "input": {
    "tagNames": [
      { "name": "中文" },
      { "name": "vision" }
    ]
  }
}
```

Strings belong to filters and Project updates, not this input.
