# Search Projects

Use this read-only workflow to search Projects by keyword and existing Resource Tag names. Apply the Query Support rules in `references/concepts/resource-tags.md`.

## Intent to Query Mapping

- `project.search.tags` -> `ProjectSearchByTags` (`compute/project-search-by-tags.graphql`)
- public tutorial browsing -> `ProjectSearchPublic` (`compute/project-search-public.graphql`)

Resolve the party and scope. Exact-match requested tag names against `common/load-tag-catalog.graphql`, then run `project-search-by-tags.graphql` with string `tagNames`. Paginate to the requested window or `pageInfo.next=0`; return name, owner, permission, tags, and `canEdit`. Treat multiple names as server-defined filtering—do not claim AND/OR semantics.

Public tutorial discovery remains on `project-search-public.graphql` with `tagNames: ["public"]` so results match the curated page.

## GraphQL Operations

- `references/graphql-operations/common/load-tag-catalog.graphql`
- `references/graphql-operations/compute/project-search-by-tags.graphql`
- `references/graphql-operations/compute/project-search-public.graphql`
