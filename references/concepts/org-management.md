# Org Management — 组织成员关系

讲组织内部的角色体系、成员生命周期、谁能做什么。本文是 skill 中所有"org 成员相关"问答的事实来源。

资源可见度（`publicPermission` / `orgPermission`）是另一层概念，单独见 `concepts/org-permissions.md`。两者经常一起出现，但属于不同的层：本文回答"谁是 OWNER"，那篇回答"这份资源对组织内开放到什么程度"。

## Role Taxonomy

`Member.role` 的类型是 `UserRole`，schema 上定义为：

```graphql
enum UserRole {
  OWNER
  MEMBER
  PENDING
}
```

| Role | 含义 |
|------|------|
| `OWNER` | 组织主要拥有者。对组织本身（成员、信息）有完全管理权；对组织名下任何资源都可以改可见度（详见 `org-permissions.md`）。|
| `MEMBER` | 普通成员。可以协作、可以创建归属于自己的资源；不能改别人创建的资源的可见度，也不能管成员。|
| `PENDING` | 已被邀请但尚未接受邀请，**不视为正式成员**，几乎所有需要成员身份的操作都不可用；接受 / 拒绝邀请请到 console 处理。|

> 历史注：早期 schema 还含 `ADMIN`，已在最新版清理移除。如果在某些缓存或老快照里看到 `Member.role == "ADMIN"`，按数据异常处理；正常调用不会返回。

### 不要把 `UserRole` 和 `PartyRole` 搞混

`UserRole` 是组织内部的成员关系（本文范围）。`PartyRole` 是平台级身份：

```graphql
enum PartyRole {
  ADMIN          # 平台超管
  NORMAL_USER
  MODEL_DESIGNER
}
```

`me.roles` 是 `[String]`，里面的字符串是 `PartyRole` 名字。`me.roles` 含 `ADMIN` 表示平台超管，与"是否是某个 org 的 OWNER"完全是两回事。

## Member Lifecycle（事实记录，不是 mutation 入口）

```
invite  (console) ────► PENDING ──accept(console)──► MEMBER ──promote(console)──► OWNER
                          └──reject(console)──► (gone)
MEMBER / OWNER ──remove(console) / leaveOrg(console)──► (gone)
```

**本 skill 当前不提供任何成员管理 mutation 的工作流**。所有写操作（邀请 / 接受 / 拒绝 / 改角色 / 移除 / 退出 / 改组织描述）请到 console 处理。skill 只负责解释规则、读取现状。

## Authorization 矩阵

记录这些规则不是为了让 LLM 去发 mutation——v1 范围内 skill 不发——而是当用户问"我能不能 X"时，可以直接据此回答，并提示去 console 操作。

| 操作 | 谁能做 | 服务端硬约束 |
|------|--------|--------------|
| 邀请成员 | OWNER | 不能邀请已经是成员的人；不能重复邀请同一个 PENDING；席位（`seatCountQuota`）必须够 |
| 接受 / 拒绝邀请 | invitee 本人 | 仅 PENDING 状态可改 |
| 取消邀请 | inviter（OWNER）| 仅 PENDING 可取消 |
| 改成员角色 | OWNER | 不能给自己升级；最后一个 OWNER 不能降级；PENDING 不能直升 OWNER（需先接受邀请变为 MEMBER）；OWNER 数受 org-admin-limit 约束 |
| 移除成员 | OWNER | 不能通过此入口移除自己（要"自己离开"用 leaveOrg）；最后一个 OWNER 不能被移除 |
| 退出组织 | 自己 | OWNER 仅当 `OWNER 数 ≥ 2` 时可离开；MEMBER 总是可以 |
| 改 org info | OWNER | 用户可改字段仅 `description`；`seatCount` / `locked` 是 admin-only |

## Capability Flags

服务端在多个对象上挂了 `can*` 布尔字段，已综合 caller 的角色 + 资源 / 组织设置做了运行时判定。**不要靠 role 推断**——读 flag 就行。

### Org 级（`org` 对象）

| Flag | 含义 |
|------|------|
| `canCreateInvitation` | caller 在该 org 是否能发起邀请 |
| `canAccessOrgManagement` | caller 是否能进入"组织管理"区（看席位、改 description 等）|
| `canUpdatePermissions` | caller 是否能改组织的资源可见度策略（详见 `org-permissions.md`）|
| `canCreateProject` / `canCreateDataset` | caller 是否能在该 org 名下新建 project / dataset |
| `canCreateAutoML` | 同上，针对 AutoML |
| `canUpdateDisplayName` | caller 是否能改 org 显示名 |
| `canAccessOrgUsages` | caller 是否能查看 org 用量统计 |

### Member 级（`member` 对象）

| Flag | 含义 |
|------|------|
| `canRemove` | caller 是否能把这个成员从 org 中移除 |
| `canChangeRole` | caller 是否能改这个成员的角色 |

读取 my-orgs / org-detail / org-members 时把这些 flag 一并展示给用户，让他清楚自己在某个 org 里能做什么。

## 与 `org-permissions.md` 的关系

- 本文 = **成员关系层**：谁是 OWNER / MEMBER / PENDING；谁能管成员。
- `org-permissions.md` = **资源可见度层**：org-owned 资源的 `publicPermission` / `orgPermission` 取值与 coupling rule。

判定"caller 是不是该 org 的 OWNER"用本文的 role 体系；判定"这份 dataset 对 org 内成员开放到什么程度"看 `org-permissions.md`。两者交叉点是"谁能改资源可见度"——那一节由 `org-permissions.md` 内部讲（OWNER 可以改任意资源；creator 可以改自己创建的；MEMBER 不能改别人的）。

## Skill 中相关工作流

- 列我的所有 org：`workflows/org/list-my-orgs.md`
- 看某一个 org 的详情：`workflows/org/inspect-org.md`
- 列 org 成员：`workflows/org/list-org-members.md`
- 列 org 名下的 datasets / projects / jobs / servings：`workflows/org/list-org-resources.md`

成员管理类写操作（改角色 / 移除 / 退出 / 改 org info / 邀请生命周期）暂不在 skill 范围，请到 console 处理。
