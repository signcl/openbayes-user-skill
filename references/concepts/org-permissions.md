# Org Permissions — 组织内可见度

公开度（`publicPermission`）控制"对外面的人"可见性，组织内可见度（`orgPermission`）控制"对自己组织成员"的可见性。这份文档讲组织权限体系本身，再讲 `orgPermission` 的业务取值和约束。

## 组织成员关系

`me.orgs` 返回 `[Member!]!`，`Member.role` 是 `UserRole`，可取 `OWNER / MEMBER / PENDING`。完整的角色定义、生命周期、authorization 矩阵和 capability flags 见 **`concepts/org-management.md`**——本文不重复。

判定"caller 是不是该 org 的 OWNER"用那份文档的 role 体系；本文只回答"这份资源对外/对组织开放到什么程度"。

**不要硬编码"哪个 role 能做什么"**：具体某个操作能不能做，由资源 / 组织上的 `can*` 布尔字段（`canUpdatePermissions`、`canCreateProject`、`canCreateInvitation` 等）在运行时给出 —— 这些字段已经把 role + 资源所有权 + 组织策略综合判断过了。LLM 在执行前应当读这些字段，而不是靠 role 推断。

## 谁能改可见度（authority to update permissions）

`updateDatasetPermissions` 和 `updateProjectEntityPermissions` 的授权规则一致，由资源 owner 决定授权来源：

### Owner 是 User（个人资源）

**只有所有者本人能改**。即使该用户在某个 org 里，org 的其他成员（包括 org 的 OWNER）也无权修改他的个人资源 —— 这份资源的 owner 是 User，不是 Org。

要让个人资源由组织接管，得发起转交（`createDatasetTransferRequest` / `createProjectTransferRequest`，async approval 流程，本 phase 不覆盖）。

### Owner 是 Org（组织资源）

两类用户能改：

1. **Org 的 `OWNER`** —— 即 `me.orgs[]` 里这条 org 的 `role == "OWNER"`。任意成员的资源都能改
2. **资源的原创建者** —— `creator.username == me.username` 的成员，且仍是该 org 的有效成员（未离组、非 PENDING）。只对自己创建的资源生效

> 注：服务端授权用的是 user 的 username 作主键（`User.id` 在内部就是 username），所以 `creator.id` 和 `creator.username` 是同一个值。skill 约定统一用 `username` 作 userId 参数，比较时也用 `username`。

特别说明：

- **普通 `MEMBER` 不能改非自己创建的资源**。即使能读、能下载、甚至能 `ORG_WRITE` 写数据，也不代表能改这份资源的可见度
- **拥有 `ORG_WRITE` 数据访问权 ≠ 能改可见度** —— `ORG_WRITE` 让你写数据，不让你重新分发资源
- 平台级 super-admin（`me.roles` 含 `ADMIN`）总是有权，但不在普通 user skill 的常规建议范围

### 实际操作时

mutation 之前一定先读 dataset 的 `canUpdatePermissions` 或 project 的 `canUpdatePermission` —— 服务端已把 owner / creator / org-OWNER / super-admin 综合判断好了，这个布尔值是唯一权威信号。

如果 `false`，根据上面的规则向用户解释原因（最常见两种：①个人资源不是你的；②org 资源你不是 creator 也不是 org OWNER）；不要直接发 mutation，会拿到 `NoAuthorizationException`。

## 资源归属：个人 vs 组织

资源（dataset / project / job / serving）的 `owner` 字段是 `Party` —— 可能是 `User`，也可能是 `Org`。判别方式：

```graphql
owner {
  id
  ... on User { username }
  ... on Org   { displayName }
}
```

服务端权限解析（`Permissions.getEntityPermissions`）按 owner 类型分两条路径：

- **owner 是 User（个人资源）**：访问完全由 `publicPermission` 决定。**`orgPermission` 字段被服务端忽略** —— 即使所有者在某个 org 里、即使 mutation 传了 `orgPermission`，访问判断只看 `publicPermission`。组织成员只能在该资源被设为 `PUBLIC_READ` 时通过"任何人可读"这条路径访问，没有"组织内额外可见"这种状态。
- **owner 是 Org（组织资源）**：必须同时设置 `publicPermission` 和 `orgPermission`；二者一起决定访问级别。

写 mutation 时：

- 个人资源（owner 是 User）：**不要传 `orgPermission`**。传了不会报错但完全无效。
- 组织资源（owner 是 Org）：**必须**传 `orgPermission`，否则服务端抛 `IllegalArgumentException("invalid permission level")`。

## OrgPermissionLevel —— 业务三档（仅适用于 Org-owned 资源）

`OrgPermissionLevel` enum 在 schema 里定义了四个值，**业务上只用三档**：

| Level | 含义 | 典型场景 |
|-------|------|---------|
| `ORG_PRIVATE` | 组织成员**不可**访问 | 资源虽属于组织但暂时只 creator 自己用 |
| `ORG_READ_AND_DOWNLOAD` | 组织成员可读、可下载 | 团队共享数据 / 项目 |
| `ORG_WRITE` | 组织成员可读、可下载、可写 | 团队协作的工作区 |

第四个值 `ORG_READ`（仅可读不可下载）业务上**不使用** —— 写文档或工作流时不要把它作为选项呈现给用户。读到现有资源的 `orgPermission` 是 `ORG_READ` 时，按"团队共享"语义处理即可，不必特别提示。

**`PUBLIC_READ_AND_DOWNLOAD` 在 Org-owned 资源上被服务端拒绝** —— `Permissions.getEntityPermissions` 的 Org 分支没有这一档的处理，会抛 `IllegalArgumentException`。组织资源要"对外开放下载"无解（只能 `PUBLIC_READ`），这是服务端硬约束，不仅仅是业务约定。User-owned 资源不受此限。

## Coupling Rule —— 公开和组织可见度的耦合（仅 Org-owned）

服务端硬约束：**对于 Org-owned 资源，`publicPermission = PUBLIC_READ` 时 `orgPermission` 不能是 `ORG_PRIVATE`**。

理由直观 —— 不能让"外面任何人都可以看，但本组织成员看不到"。`Permissions.getEntityPermissions` 没有这条分支，命中即 `IllegalArgumentException`。**服务端是直接拒绝，不会自动升级**。

写 mutation 时由 LLM 提前避免冲突：

- 把组织资源公开（设置 `PUBLIC_READ`）时，如果当前 `orgPermission` 是 `ORG_PRIVATE`，**同时**把它升级到 `ORG_READ_AND_DOWNLOAD`（或 `ORG_WRITE`，按用户意图选）；不要发出"PUBLIC_READ + ORG_PRIVATE"的请求
- 把 `orgPermission` 收紧到 `ORG_PRIVATE` 时，如果当前 `publicPermission` 是 `PUBLIC_READ`，**先**降到 `PRIVATE`，否则向用户解释冲突，确认意图后再二选一执行

User-owned 资源不涉及这条规则（`orgPermission` 字段对它无意义）。

读路径上不需要做强制：现存数据如果出现这种组合，照实呈现，不要篡改。

## 跟工作流的关系

- Dataset 改 `orgPermission`：`workflows/dataset/update-dataset-permissions.md`
- Project 改 `orgPermission`：`workflows/compute/update-project-permissions.md`
- 公开度（`publicPermission`）单独文档：`concepts/resource-visibility.md`
