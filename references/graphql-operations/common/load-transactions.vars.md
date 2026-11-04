# load-transactions variables

## vars.json

```json
{
  "userId": "zhangsan",
  "page": 1,
  "type": ["ALL"],
  "showOnlyAllowCreateFapiao": false
}
```

## 三个长得像的 enum

| 位置 | enum | 回答什么 |
|---|---|---|
| 入参 `$type` | `TransactionTypeInput` | 筛选条件，充值按渠道拆成 `DEPOSIT_*` |
| 响应 `TransactionHistory.type` | `TransactionType` | 这条流水是什么性质（充值只有一个 `DEPOSIT`，订阅相关拆得细） |
| 响应 `TransactionHistory.account` | `Account` | 走的哪条支付通道，不是流水类型 |

「花在哪了」看响应侧 `type`；「用什么付的」看 `account`。

`$type` 数组把任一 `DEPOSIT_*` 与其他值混在一起会返回空页（HTTP 200、`total: 0`，无报错）；单值与 `[CHARGE, REFUND]` 这类非充值组合正常。要同时看充值与消费，用 `[ALL]` 后按响应侧 `type` 分。

## TransactionTypeInput enum values（入参 `$type`）

From `references/graphql/schema.graphql`:

- `CHARGE`
- `DEPOSIT_ALIPAY`
- `DEPOSIT_GIFT`
- `DEPOSIT_INVITEE_GIFT`
- `DEPOSIT_INVITER_GIFT`
- `DEPOSIT_VOUCHER_GIFT`
- `DEPOSIT_BANK_TRANSFER`
- `DEPOSIT_INTERNAL_TEST`
- `DEPOSIT_STRIPE`
- `DEPOSIT_AIRWALLEX`
- `REFUND`
- `TRANSFER_FROM`
- `TRANSFER_TO`
- `ALL`

## TransactionType enum values（响应 `TransactionHistory.type`）

From `references/graphql/schema.graphql`:

- `DEPOSIT`
- `CHARGE`
- `REFUND`
- `CONTAINER_SUBSCRIPTION_REFUND`
- `CONTAINER_SUBSCRIPTION_CREATE`
- `CONTAINER_SUBSCRIPTION_CHARGE`
- `CONTAINER_SUBSCRIPTION_RENEW`
- `TRANSFER_FROM`
- `TRANSFER_TO`
- `STRIPE_SUBSCRIPTION_INIT`
- `STRIPE_SUBSCRIPTION_INIT_ROLLBACK`
- `STRIPE_INVOICE_CREDIT_MIGRATE`
- `STRIPE_INVOICE_CREDIT_ROLLBACK`

## Account enum values（响应 `TransactionHistory.account`）

From `references/graphql/schema.graphql`:

- `ALIPAY`
- `BALANCE`
- `STRIPE`
- `AIRWALLEX`

## PartyType enum values（响应 `User.type` / `Org.type`）

From `references/graphql/schema.graphql`:

- `USER`
- `ORG`
