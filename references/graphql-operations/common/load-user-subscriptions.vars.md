## vars.json

```json
{
  "username": "<from-bootstrap me.username>",
  "category": "ALL"
}
```

## vars.active-only.json

Pass the same variables as `vars.json` — the query always fetches all categories. Filter to active subscriptions by checking `status == "ACTIVATED"` on the returned records in post-processing.

## Variables

| Variable | Type | Required | Default | Notes |
|----------|------|----------|---------|-------|
| `username` | `String!` | Yes | — | From bootstrap `me.username` |
| `category` | `PlanCategoryInput` | No | `ALL` | Enum — see values below |

## PlanCategoryInput enum values

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
- `ALL` (default — returns all categories)

## Return field semantics

Key fields for explaining "why is my balance disappearing":

| Field | Meaning |
|-------|---------|
| `status` | `ACTIVATED` = currently active and billing; `CANCELED` = cancelled but may still be in effect until `effectedTo`; `EXPIRED` = ended |
| `renewable` | `true` = will auto-renew at `effectedTo`; **this is the most common surprise charge source** |
| `effectedTo` | Subscription end date — when `renewable=true`, also the **next auto-charge date** |
| `effectedFrom` | Subscription start date |
| `duration` | Billing cycle: `MONTH_1`, `MONTH_3`, `MONTH_6`, `YEAR_1`, etc. |
| `plan.name` | Human-readable plan name (e.g., "HyperAI Pro 月度", "5090 算力套餐") |
| `plan.category` | Which category this plan belongs to (`STORAGE`, `MEMBERSHIP`, `CONTAINER_TIME_BOXED_COMPUTATION`, etc.) |
| `plan.price.amount` | Price per billing cycle in smallest currency unit |
| `plan.price.currency` | Currency code (e.g., `CNY`) |
| `container` | For `CONTAINER_TIME_BOXED_COMPUTATION` subscriptions — the associated Job/workspace |
| `canCancel` | Whether the user can cancel this subscription right now |

## SubscriptionStatus enum values

- `ACTIVATED` — Active, may be billing
- `CANCELED` — User-cancelled; remains active until `effectedTo`
- `REVERSED` — Reversed/refunded
- `DEGRADED` — Downgraded to a lower tier
- `EXPIRED` — Ended

## Typical use in finance analysis

When explaining "我没买东西为什么扣钱" (why am I being charged without buying anything):

1. Filter `status == "ACTIVATED"` and `renewable == true`
2. These are the active auto-renewing subscriptions — each will charge `plan.price.amount` on `effectedTo`
3. Match `SUBSCRIPTION_RENEW` transactions by checking if the transaction's `createdAt` is near the subscription's `effectedFrom`/renewal date
4. Show: plan name, price per cycle, next renewal date, whether it can be cancelled
