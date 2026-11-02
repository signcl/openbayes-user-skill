---
title: 通过 bayes 登录 OpenBayes
description: 如何通过 bayes 登录 OpenBayes
category: cli-idx
sidebar_position: 3
---

## 前提要求

- 您必须已拥有一个 OpenBayes 账号
- 您的 OpenBayes 账号必须可以正常登录
- `bayes` CLI 工具已在您的电脑上 [正确安装](/docs/cli/)

## 通过令牌登录（推荐）

推荐使用令牌（Token）进行登录，尤其适用于 CI/CD 流水线、脚本自动化等无交互场景。

您可以在 OpenBayes [个人设置](https://openbayes.com/console/profile) 页面获取您的 API 令牌。

### 方式一：通过命令行参数登录

直接将令牌作为参数传递给 `bayes login`：

```bash
$ bayes login <your-token>
username 已成功登入 openbayes
```

### 方式二：通过环境变量登录

设置 `OPENBAYES_TOKEN` 环境变量后，CLI 会自动读取并完成认证，无需手动执行 `bayes login`：

```bash
export OPENBAYES_TOKEN=<your-token>
```

如果需要同时指定组织，可以配合 `OPENBAYES_ORG` 和 `OPENBAYES_USER` 环境变量使用：

```bash
export OPENBAYES_TOKEN=<your-token>
export OPENBAYES_USER=<your-username>
export OPENBAYES_ORG=<org-name>
```

## 通过用户名和密码登录

```bash
$ bayes login
请输入用户名: username
请输入 username 的密码:
username 已成功登入 openbayes
```

## 切换到组织

如果你有加入其他组织，也可以通过 bayes 切换到某一个组织进行操作。

首先查看当前的组织列表：

```bash
$ bayes org ls
  ROLE    ID              NAME
  MEMBER  open-tutorials  open-tutorials
```

然后切换到组织 `open-tutorials`：

```bash
$ bayes org switch open-tutorials
已成功切换到组织 open-tutorials
```

和 OpenBayes 的 Web 页面类似，当 bayes 切换到某一个组织后，其所看到的容器、数据仓库等信息都是当前组织的而不是个人的了。

通过命令 `bayes status` 可以看到自己当前所在的组织：

```bash
$ bayes status
当前环境: https://openbayes.com
当前组织: open-tutorials
用户名: openbayes
邮箱: xxx@openbayes.com
```

如果想要切换回自己的个人账户，则可以使用 `bayes org switch <username>` 来实现。

## 登出当前账号

```bash
$ bayes logout
已成功登出
```

CLI 会记住您当前的用户名信息，下次登录时，再次输入密码即可：

```bash
$ bayes login
请输入 username 的密码:
username 已成功登入 openbayes
```

如果您希望切换登录账号，需要在登录时指定用户名：

```bash
$ bayes login herobcat
请输入 herobcat 的密码:
herobcat 已成功登入 openbayes
```