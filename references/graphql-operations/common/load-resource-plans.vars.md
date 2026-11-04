# load-resource-plans variables

`category` 在模板里写死为 `[UNIT_COMPUTATION, CONTAINER_TIME_BOXED_COMPUTATION]`，只有 `resource` 一个可选变量（资源 `name`，从 `load-resource-catalog.graphql` 读）。

## vars.json

```json
{
  "resource": "vgpu"
}
```

## PlanCategory enum values（响应 `Plan.category`）

From `references/graphql/schema.graphql`:

- `UNIT_COMPUTATION`
- `PERMANENT_COMPUTATION`
- `SINGLE_TIME_PERMANENT_COMPUTATION`
- `STORAGE`
- `CONTAINER_TIME_BOXED_COMPUTATION`
- `SHARED_TIME_BOXED_COMPUTATION`
- `TIME_BOXED_COMPUTATION`
- `MEMBERSHIP`
- `ORG`
- `COUPON`

## PlanDuration enum values（响应 `ContainerTimeBoxedComputationPlan.duration`）

From `references/graphql/schema.graphql`:

- `DAY_1`
- `WEEK_1`
- `WEEK_2`
- `MONTH_1`
- `MONTH_3`
- `MONTH_6`
- `YEAR_1`
