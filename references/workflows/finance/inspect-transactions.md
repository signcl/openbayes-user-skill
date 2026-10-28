# Inspect Transactions — 用户自服务费用分析

Use this workflow when a user asks why their balance dropped, why they're being charged, where their money went, or wants a breakdown of recent spending.

**Common triggers**:
- "为什么我钱这么快花完了"
- "上个月花了多少"
- "我没买东西为什么扣钱"
- "where did my balance go"

**对应 admin 视角**：`openbayes-admin-biz` skill 的 finance inspect workflow 是 admin 看任意用户的视角；本文档是 user 自服务诊断，**只查自己的资源**。

## 币种（必读）

**币种只看金额自带的 `currency` 字段——不要靠环境（vendor / endpoint）去推断，也不要按数字大小猜。** schema 里所有钱都是 `Money { amount, currency }`：`account.balance`、`account.debtMoney`、每条 `transaction.amount`、每个 `plan.price` / `originalPrice`、每张卡的单价都各自带 `currency`。

- 报数时永远把 `amount` 和它旁边的 `currency` 一起读、一起呈现。不同环境币种不同（有的 `CNY`、有的 `USD`），`199` 在 USD 环境是 $199 而不是 ¥199。
- 不要硬编码 `¥`/`$` 符号；符号/代码由值里的 `currency` 决定。
- 跨币种的金额不能直接相加或比大小（CNY 与 USD 不可混算）。

## 数据源（多源 stitching）

参考 OpenBayes console 的 Finance Overview 设计——单条 query 不够回答"为什么"，要拉 4 路数据然后交叉：

| 数据 | Op | 角色 |
|------|-----|------|
| 身份 + balance + debt | bootstrap 自带 (`whoami.graphql`) | 起点 |
| 配额状态 | `load-quota.graphql` | 当前用量 vs 配额，定位"是不是某资源跑满了" |
| 活跃订阅 | `load-user-subscriptions.graphql` | **自动续费扣款来源**——"我没买东西为什么扣钱"的答案多半在这里 |
| 30 天流水 | `load-transactions.graphql` | 实际现金流出 |
| 用量明细 | `load-usages.graphql` | 按资源类型分桶用量 |

## 执行步骤

**必须依次调用以下全部 4 个 GraphQL operations**（缺任何一个都会漏掉关键信息）：

### 步骤 1：Bootstrap

执行 `references/workflows/common/bootstrap.md`，获取 `username` / `account.balance` / `account.debtMoney`。

以下 `<from-bootstrap>` 均填该 `username` 值；变量名按 operation 区分：订阅、用量用 `username`，流水、配额用 `userId`。

### 步骤 2：Load active subscriptions（必须调用）

```bash
bash <skill-dir>/scripts/run_graphql.sh \
  --vendor openbayes \
  --query-file references/graphql-operations/common/load-user-subscriptions.graphql \
  --vars-json "{\"username\":\"<from-bootstrap>\"}"
```

### 步骤 3：Load 30 天 transactions（必须调用）

```bash
bash <skill-dir>/scripts/run_graphql.sh \
  --vendor openbayes \
  --query-file references/graphql-operations/common/load-transactions.graphql \
  --vars-json "{\"userId\":\"<from-bootstrap>\",\"page\":1,\"type\":[\"ALL\"]}"
```

### 步骤 4：Load usages（必须调用）

```bash
bash <skill-dir>/scripts/run_graphql.sh \
  --vendor openbayes \
  --query-file references/graphql-operations/common/load-usages.graphql \
  --vars-json "{\"username\":\"<from-bootstrap>\",\"page\":1}"
```

### 步骤 5：Load quota（必须调用）

```bash
bash <skill-dir>/scripts/run_graphql.sh \
  --vendor openbayes \
  --query-file references/graphql-operations/common/load-quota.graphql \
  --vars-json "{\"userId\":\"<from-bootstrap>\"}"
```

## 分析模式

### 5.1 按 transaction 分桶

**`type` 和 `description.descType` 是两套不同词汇，共用了不少同名 token，别混。** console `Transactions.tsx` 的 typeMap 同时接收这两个字段（`typeMap[item.type]` 和 `typeMap[item.description?.descType]`），**不能整体当成 `type` 的取值表**。

`type`（`TransactionType` 枚举，schema 约束，仅 13 值）：

- 计入消费：`CHARGE`、`CONTAINER_SUBSCRIPTION_CHARGE` / `_CREATE` / `_RENEW`
- 不计入：`DEPOSIT`（充值）、`REFUND` / `CONTAINER_SUBSCRIPTION_REFUND`（退款）、`TRANSFER_FROM` / `TRANSFER_TO`（内部互转）、`STRIPE_SUBSCRIPTION_INIT` / `_INIT_ROLLBACK` / `STRIPE_INVOICE_CREDIT_MIGRATE` / `_ROLLBACK`（账务调整）

**按上面的白名单聚合，别用「排除充值和退款」**——那会把内部互转和 Stripe 回滚当成用户消费。按白名单总额排序找 top 3 流出来源。

`descType`：schema 里是 **`String` 而非枚举**，由后端逐处以字面量写入。已知有 `ORDER`、`SUBSCRIPTION_RENEW`、`VOUCHER_GIFT`、`SUBSCRIPTION_REFUND`、`ACCOUNT`、`DEPOSIT`、`CHARGE` 等（来源：console typeMap 与 `descType === '...'` 判断）。**无法对 schema 校验，也不保证完整**——按它分支前先看实际返回值。

### 5.2 把订阅匹配到流水

订阅续费在 `type` 上体现为 `CONTAINER_SUBSCRIPTION_RENEW`（容器订阅），其余订阅续费要看 `description.descType == "SUBSCRIPTION_RENEW"`——**`SUBSCRIPTION_RENEW` 不是 `TransactionType` 的值**，拿它去匹配 `type` 永远匹配不到。

命中后**用 `context` 匹配套餐**：它带套餐快照（含 `id` / `name` / `price` / `resource` / `category`），可直接对上 `availableSubscriptions` 的 plan name。`description` 不行——该类型只有 `id` 和 `descType`（**没有 `text`**），而 `descType` 只是分类 token，永远不是套餐名；`description.id` 只能当对账单据号。

举例叙事：
> "2026-05-15 的 SUBSCRIPTION_RENEW ¥299，对应你 2026-02 订阅的 'HyperAI Pro 月度' 套餐自动续费。"

### 5.3 找异常峰值

计算 transactions 金额的中位数，标出 > 中位数 × 5 的单笔——可能是用户忘了的大额订单或集中消费。

### 5.4 找仍在跑的高价 job

从 bootstrap 拿到的 `jobs` 列表 + quota 用量交叉。如果某个 job 在 RUNNING 状态且占用了高价资源（V100/A100/4090 等），告诉用户"这个 job 还在烧钱，你要继续吗"。

## 输出叙事模板

> 下面的 `¥` 仅为示例占位——实际符号/代码由各金额的 `currency` 决定（USD 环境用 `$`）。见上文「币种（必读）」。

```
你这个月（截至今天）共支出 ¥X，余额 ¥Y。

主要流出（top 3）：
1. 算力消费 ¥A（NVIDIA RTX 4090 共 18 小时，单价 ¥xx/h）—— job j-abc123 仍在 RUNNING，要停吗？
2. 自动续费 ¥B（"HyperAI Pro 月度" 5-15 续费，5-15 同时还有 "5090 月度算力" 续费）
3. Storage 订阅 ¥C（25 GB 扩容月费）

建议：
- 若 j-abc123 训练已完成可立即停止节省约 ¥xx/h
- 不需要的自动续费可在 console > Finance 取消
```

## Anti-patterns

- 只看 transactions，忽略 subscriptions —— 漏掉自动续费这条线索就回答不了"我没买东西怎么扣钱"
- 只调用 1-2 个 op 就回答 —— 必须全部 4 个 op 都调用完再综合分析
- 用 admin-biz 的 ops 查别人的钱 —— 本 workflow 只用 user-scope ops
- 按环境 / 数字大小推断币种，或硬编码 `¥`/`$` —— 永远读金额自带的 `Money.currency`
- 给 vouchers / incomplete orders / membership-plan-listing 的分析（这些在 spec 范围外，YAGNI）

## GraphQL Operations Used

- `references/graphql-operations/common/whoami.graphql`
- `references/graphql-operations/common/load-transactions.graphql`
- `references/graphql-operations/common/load-usages.graphql`
- `references/graphql-operations/common/load-quota.graphql`
- `references/graphql-operations/common/load-user-subscriptions.graphql`
