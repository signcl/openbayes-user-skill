---
title: 通过 SSH 连接运行中的 Jupyter 工作空间
category: gear
sidebar_position: 7
---

import Media from '@site/src/components/Media';

## 功能介绍

OpenBayes 支持通过 SSH 协议来访问运行中的 Jupyter 类型的执行。有两种通过 SSH 访问机器的验证方式：

1. 基于密码的验证：这种方式需要用户输入密码进行身份验证。
2. 基于公钥的验证：这种方式使用公钥加密技术进行身份验证。它涉及在客户端生成一对密钥（公钥和私钥），并将公钥添加到 OpenBayes。私钥被安全地保存在本地机器上，并用于在不需要密码的情况下进行身份验证。

:::caution 注意
只有运行中的「Jupyter 工作空间」才能通过 SSH 协议访问。
:::

## 使用密码

在工作空间创建成功后，页面会出现 ssh 登录相关的信息，也会为该容器创建一个密码，通过该密码可以完成 SSH 的身份验证，无需其他步骤。

![](/img/docs/running-workspace-view.png)

如上图所示，点击「复制密码」即可。

## 使用公钥

通过完成以下步骤就可以实现 SSH 访问了：

1. 向 OpenBayes 上传个人的 SSH 公钥
2. 在本地增加 OpenBayes SSH 访问的配置
3. 通过命令 `ssh root@xxx -pxxxx` 实现 SSH 登录

### 准备公钥

打开命令行输入 `ssh-keygen -m PEM -t rsa -b 4096 -C "your.email@example.com"` (自己的邮箱) ，连续点击 Enter 即可生成一个密钥对。Windows 用户推荐采用 PowerShell 进行这步操作。

```bash
ssh-keygen -t rsa -b 4096 -C "your.email@example.com"
# Creates a new ssh key, using the provided email as a label
# Generating public/private rsa key pair.
Enter file in which to save the key (/Users/you/.ssh/id_rsa): [Press enter]  // 推荐使用默认地址
Enter passphrase (empty for no passphrase):   //此处点击 Enter 键即可，也可以填写密码，填写密码后每次使用 SSH 方式推送代码时都会要求输入密码，由于这个 Key 也不是用于军事目的，所以也无需设置密码
```

:::note
如果你对这部分非常了解可以按照常规创建公钥的流程即可，更多的信息可以参见 [生成 SSH 公钥](https://git-scm.com/book/zh/v2/%E6%9C%8D%E5%8A%A1%E5%99%A8%E4%B8%8A%E7%9A%84-Git-%E7%94%9F%E6%88%90-SSH-%E5%85%AC%E9%92%A5)。
:::

成功后显示如下信息：

```bash
Your identification has been saved in /Users/you/.ssh/id_rsa.
# Your public key has been saved in /Users/you/.ssh/id_rsa.pub.
# The key fingerprint is:
# 01:0f:f4:3b:ca:85:d6:17:a1:7d:f0:68:9d:f0:a2:db your.email@example.com
```

### 添加公钥

1. 打开 `~/.ssh` 目录（Windows 下为用户目录的 `.ssh` 目录），用编辑器打开 `id_rsa.pub` 文件（此处是生成公钥的默认名称，如果生成公钥时采用了其他名称，打开相对应的文件即可），复制全部内容。
2. 登录 OpenBayes 页面，在界面左侧导航栏点击「SSH 设置」->「添加新公钥」，将内容粘贴到「公钥」的文本框里并给自己的这个 SSH 公钥起个名字，点击添加 SSH 公钥即可。

![](/img/docs/add-ssh.png)

### 使用 bayes CLI 管理 SSH 公钥

安装并登录 [bayes 命令行工具](/docs/cli/install/) 后，可通过 `bayes ssh` 子命令创建或上传公钥至 OpenBayes：

```bash
# 创建并上传新的 SSH 公钥
bayes ssh create --name my-device

# 上传已有的公钥文件
bayes ssh upload ~/.ssh/id_rsa.pub --name my-device
```

`--name` 选项用于为公钥指定一个易于识别的名称，不填则默认使用当前主机名。通过 CLI 上传的公钥会在所有工作空间中生效。

### 手动追加公钥

如果暂时无法使用 CLI，可先使用密码登录到工作空间，然后在本地执行以下命令将公钥追加到当前工作空间：

```bash
cat ~/.ssh/id_rsa.pub | ssh -p <端口号> root@ssh.openbayes.com 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'
```

将 `<端口号>` 替换为工作空间页面中显示的端口。此方法只在当前运行的工作空间中生效，重启后需要重新追加。

## 通过命令行登录

<Media
  url='/video/docs/ssh.mp4'
  type='video'
  loading='lazy'
  controls
/>

### 1. 获取 ssh 登录信息

在启动「工作空间」后，其页面会展示 ssh 登录信息，如下图所示：

![](/img/docs/ssh-info-in-jupyter-workspace-page.png)

点击「复制命令」即可将命令拷贝到剪贴板，其命令行展示如下：

```bash
ssh root@ssh.openbayes.com -p30360
```

其中 `root` 为用户名，`ssh.openbayes.com` 为服务器地址，可能是 IP 也可能是 openbayes 所指定的其他域名，`30360` 为端口号。


### 2. 登录运行的 Jupyter 工作空间

将上述命令粘贴到命令行或按照上面的信息填写到其他支持 ssh 的客户端中即可实现通过 ssh 登录运行的 Jupyter 工作空间。

![](/img/docs/ssh-connect-with-terminal.png)

如果你没有上传本地的公钥，则在这个步骤需要粘贴 SSH 的登录密码。

### 3. WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED

如果将 `ssh` 登录命令粘贴到命令行中展示如上的报错，那需要做一个额外的步骤解决这个冲突。

在命令行下输入如下信息：

```bash
ssh-keygen -R [ssh.openbayes.com]:<你的工作空间的端口>
```

然后再次粘贴从「工作空间」复制的 `ssh` 命令即可。

<Media
  url='/video/docs/ssh-with-changed-host-key.mp4'
  type='video'
  loading='lazy'
  controls
/>


## 通过 VS Code SSH 连接

如果是通过 SSH 远程连接运行中的 Jupyter 环境，首先请阅读 VS Code 相关文档 [Remote Development using SSH](https://code.visualstudio.com/docs/remote/ssh) 了解 VS Code 对这方面的支持。并安装相应的插件。

<Media
  url='/video/docs/ssh-with-vscode.mp4'
  type='video'
  loading='lazy'
  controls
/>

### 1. 安装 VS Code SSH 插件

![](/img/docs/vscode-remote-ssh-plugin.png)

安装如上插件。

### 2. 在 VS Code 中配置 ssh 连接

点击左下角，打开远程窗口。

![](/img/docs/open-remote-command-in-vs-code.png)

在命令面板选择「Connect to Host...」并回车。在下拉框滚动到最底部，看到「Add New SSH Host..」，点击即可添加新的 SSH 连接。

![](/img/docs/connect-to-host-in-vs-code.png)

输入完整的 ssh 命令，点击回车后使用默认的 ssh 配置文件，无需修改。

![](/img/docs/input-ssh-info-in-vscode.png)

再次点击 vscode 左下角的远程窗口，点击「Connect to Host...」，选择已经配置好的 SSH 连接，点击「Connect」即可连接。

### 3. 修改默认的访问目录

VS Code 会弹出一个新的窗口并提示连接成功了。目前其所指向的目录为 `/root` 而不是 OpenBayes 所默认使用的工作目录，点击左侧栏目中「打开文件夹」切换到 `/openbayes/home` 就可以看到目录中的内容了。

![](/img/docs/vs-code-switch-directory-to-workdir.png)

### 4. 安装额外插件以支持 Jupyter 文件的执行

在 ssh 远程登录的情况下，如果你需要在容器内执行 `.ipynb` 文件，需要安装相应的插件。

新建文件 `main.ipynb` 双击后在页面的右上角会显示 `Select Kernel` 点击后会要求安装插件：

![](/img/docs/install-kernel-in-vscode.png)

按照提示，点击「Install in SSH...」。

![](/img/docs/install-jupyter-in-ssh.png)

安装完成后回到刚才的 `main.ipynb` 页面，发现右上角已经选择了默认的 `kernel` 了，并且可以执行 python 命令了。

![](/img/docs/run-jupyter-cell-in-vs-code.png)

