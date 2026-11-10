---
title: 使用 SSH Tunnel 访问容器的服务
category: gear
sidebar_position: 9
---

import Media from '@site/src/components/Media';

:::info 提示
除了使用 SSH Tunnel，OpenBayes 还提供了更便捷的[自定义端口映射功能](/docs/gear/expose-service)，可以直接将容器内的服务暴露到公网。

**选择指南：**

- **SSH Tunnel**：适合个人临时访问，无需实名认证，只有建立隧道的本机可访问服务
- **端口映射**：适合需要持续提供服务给多个用户访问的场景，需要实名认证

本文档中的 Gradio 示例也可以通过端口映射方式实现，详见[自定义端口映射文档](/docs/gear/expose-service#部署-gradio-应用)。
:::

SSH Tunnel 是一种通过加密 SSH 连接来转发本地或远程计算机上的网络连接的方法。您可以使用 SSH Tunnel 来访问远程服务器上被防火墙保护的服务，而无需直接将端口暴露在公共互联网上。

有两种通过 SSH 访问机器的验证方式：

1. 基于密码的验证：这种方式需要用户输入密码进行身份验证。
2. 基于公钥的验证：这种方式使用公钥加密技术进行身份验证。它涉及在客户端生成一对密钥（公钥和私钥），并将公钥添加到 OpenBayes。私钥被安全地保存在本地机器上，并用于在不需要密码的情况下进行身份验证。

## 使用密码

OpenBayes 的 SSH 服务默认提供了密码登录的方式，如果不想配置密钥也可以按照 [使用密码访问 SSH](/docs/gear/ssh/#使用密码) 的方式。

## 配置 ssh key

如果您已经有 SSH 密钥，则可以跳过此步骤。相关的信息请在 [准备公钥](/docs/gear/ssh#准备公钥) 查看。

## 如何使用命令访问端口

### 1. 启动一个 openbayes 的工作空间

![](/img/docs/workspace-example-for-ssh-tunnel.png)

复制「SSH 访问」面板中的命令到自己电脑的终端，确认是否可以成功的访问到容器。如果看到如下的内容说明已经成功访问到容器了。

```bash
$ ssh root@ssh.openbayes.com -p31552

Last login: Fri May  5 03:47:16 2023 from 10.110.14.192
OpenBayes

目录说明

- /openbayes/home 工作空间内的数据保存地址，容器停止后，该目录中的内容不会被删除
- /openbayes/input/input0 - /openbayes/input/input4 为数据集绑定地址，此地址为只读权限，不会占用工作空间的存储容量，最多支持同时绑定 5 个

⚠️  其他目录下的内容在容器关闭后会被自动删除！更多信息请访问 https://openbayes.com/docs/concepts

使用命令行工具

通过命令 bayes gear init 可以初始化容器中的命令行工具，更多信息见 https://openbayes.com/docs/cli/

(base) root@xushanchuan-fb075g25qn2k-main:/openbayes/home#
```

### 2. 在容器中启动一个 gradio 的服务

首先在「工作空间」中打开一个终端，安装 gradio 的依赖：

```bash
$ pip install gradio --user
```

然后创建一个 `app.py` 文件，内容如下：

```python
import gradio as gr


def greet(name):
    return "Hello " + name + "!!"
 
demo = gr.Interface(fn=greet, inputs="text", outputs="text")
demo.launch()
```

最后运行 `python app.py` 启动服务，可以看到如下的输出：

```bash
$ python app.py

Running on local URL:  http://127.0.0.1:7860

To create a public link, set `share=True` in `launch()`.
```

可以看到服务已经成功启动，访问地址为 `http://127.0.0.1:7860`。

### 3. 通过 ssh tunnel 访问远程端口

使用以下命令启动 ssh tunnel：

```bash
$ ssh -N -L localhost:7860:localhost:7860 root@ssh.openbayes.com -p31552
```

其中 `root@ssh.openbayes.com -p31552` 要保持和「SSH 访问」面板中看到的一致。

然后就可以在本地访问 `http://localhost:7860` 获取到服务了：

![](/img/docs/gradio-hello-world.png)


## 视频演示

视频演示没有声音，请结合上述内容观看该视频演示。

<Media
  url='/video/docs/openbayes-ssh-tunnel.mp4'
  type='video'
  loading='lazy'
  controls
/>
