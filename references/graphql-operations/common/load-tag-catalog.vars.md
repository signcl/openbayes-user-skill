# load-tag-catalog variables

两个变量都有默认值（`ALL` / `LIST`），空对象即可。

## vars.json

```json
{}
```

## TagReservedTypeInput enum values（入参 `$include`）

From `references/graphql/schema.graphql`:

- `UNRESERVED`
- `RESERVED`
- `ALL`

## TagStructureInput enum values（入参 `$type`）

From `references/graphql/schema.graphql`:

- `TREE`
- `LIST`
