# Bootstrap：身份验证与上下文加载

需要用户上下文时执行：创建/修改资源前预判余额、quota、features、limitations；查询需要 username 参数；或当前身份与认证状态不明确。纯本地解释不需要 bootstrap；只读元数据、公开资源和按已知 ID 查对象可省完整上下文加载，但执行 API 仍须已有登录 session。

## 登录前置流程

**认证只用 `--login` 创建的 session。** 缺少 session 或服务端拒绝认证时，按 `references/runtime-setup.md` 登录，不搜索旧 `.env`、不索要长期 token、不尝试其他 token 来源。

1. 按用户指定环境选择 `--vendor`。官方 openbayes/hyperai/beta 自带地址；其他环境先向用户确认控制台地址和 profile 名。
2. 发起登录：
   ```bash
   bash <skill-dir>/scripts/run_graphql.sh --login --vendor <name>
   ```
   自定义环境加 `--endpoint <控制台地址>`。第一段打印授权 URL 后退出，把 URL 交给用户，让用户登录正确账号、选择有效期并确认，再回传一次性授权码。
3. 接续：
   ```bash
   bash <skill-dir>/scripts/run_graphql.sh --login --vendor <name> --code <一次性授权码>
   ```
   复用同一 pending 的 verifier 和 endpoint，无需重传地址。码过期或 pending 失效则重新发起，不反复兑换旧码。
4. 成功后用同一个 `<name>` 执行下面的 whoami，确认身份再继续用户最初的请求，不停在“登录完成”。`<name>` 必须沿用刚授权的 profile，不重置为默认值。session 与 pending 内容由客户端内部管理，Agent 不读写。

旧部署无授权页时需要升级，不回退手工 token 登录。PAT 的创建/列表/吊销是独立的凭据管理能力，见 `manage-personal-access-token.md`，不是本 skill 的登录入口。控制台管理页为 `https://openbayes.com/console/settings/account/personalAccessToken`（HyperAI 换 `https://app.hyper.ai`）。

## 执行

```bash
bash <skill-dir>/scripts/run_graphql.sh --vendor <name> --query-file /abs/path/to/references/graphql-operations/common/whoami.graphql --vars-json '{}'
```

`me` 无变量，由 session 中的 token 确定身份。获取用户身份（username、displayName、roles）、账户余额与欠费、quota、并发限制及用量、组织角色和活跃 jobs。

## 返回字段用途

| 字段 | 用途 |
|------|------|
| `username` | 用户标识，即后续 userId 参数 |
| `displayName` | 向用户展示的名称 |
| `registerAt` | 注册时间，辅助调整引导深度 |
| `roles` | 判断 ADMIN 权限 |
| `locked` | 账户是否锁定 |
| `hasMembership` | 付费会员 |
| `features` | 可用功能开关 |
| `account.balance` | 按量计费的钱包余额 |
| `account.debtMoney` | 欠费金额 |
| `quota` | 存储与订阅算力剩余量，不是资源可用性判据 |
| `limitations` | 资源并发上限及当前使用量 |
| `group` | 所属分组，影响资源和镜像可见性 |
| `orgs` | 组织 ID 与 OWNER/ADMIN/MEMBER 角色 |
| `jobs` | 活跃 jobs，展示与计数遵守 `references/workflows/compute/list-jobs.md` 的 SANDBOX 排除规则；不把 Agent 基础设施当用户资源 |

## 前置检查与恢复

- **认证失败/过期**：在同 vendor 重新登录，不自动换来源或 profile。重登录后 username 必须与原操作身份一致；不同则停下向用户确认，写/admin 操作再核对 roles 和 endpoint。
- **权限不足**：whoami 成功但缺 ADMIN 不是 token 失效，不继续 admin 操作；说明需要管理员账号授权。
- **账户锁定**：locked=true 时通知用户，多数操作不可用。
- **欠费**：debtMoney.amount > 0 时提醒可能影响创建资源。
- **网络失败**：DNS、连接拒绝、超时按网络/站点排查，不当作过期，不用重试登录掩盖网络问题。
- **环境错配**：比对用户目标环境和回执 endpoint，向用户确认切 profile 后再操作，不静默切换。

## quota ≠ capability

平台有两套并行计费：

- **订阅计费**：`quota.computationQuota[].value.availableMinutes` 是包日/周/月套餐剩余分钟，普通用户为 0 很常见。
- **按量付费**：余额 > 0 且目标资源 affordable=true 时，可以按小时实时扣 balance 启动 job。

**availableMinutes=0 不等于不能用 GPU，不据此要求充值订阅。** 能否启动看：

1. `common/load-shared-resource-catalog.graphql` 中目标资源 affordable=true 且 isFullLoad=false。
2. `limitations.resources[resource].freeCount > 0`。

quota 与 estimatedQuota 只作展示，不作硬门槛；用户未问订阅剩余时长，不必强调 quota=0。

## 用户画像与后续操作

综合 registerAt、资源用量、项目/数据集数量、过滤后的 jobs、hasMembership 判断引导深度，不依赖单一字段。注册很久但未使用也可能是新手。

- **老用户**：少讲概念，直接给目标配置。创建容器前检查是否有已停止 workspace 可重启，问“重启已有的还是新建，放哪个项目”。
- **新用户**：解释 workspace、镜像和数据绑定，先确认资源配置与费用，不默认最贵资源。
- **空账号**：limitations.project 与 limitations.dataset 的 privateItem.current、publicItem.current 都为 0，过滤后的 jobs 也为空时，用户要试 notebook/容器，先通过 `references/workflows/common/explore-public-resources.md` 查询公开教程，展示当前候选让用户选，不固定教程。选定后核对镜像、算力与费用，确认再克隆；若教程为空则如实说明，可改建空白 workspace。克隆后验证见 `references/workflows/compute/clone-tutorial.md` 第 5 步。

创建容器结合 features、limitations、余额和已有 jobs；组织操作用 orgs 的 ID 与角色；余额直接引用 account.balance；userId 用 username。所有 pageInfo 列表及嵌套列表的计数、汇总遵守 `references/graphql-discipline.md` 分页规则，不能只数首页。
