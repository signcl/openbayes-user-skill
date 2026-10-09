---
title: 远程连接运行中的 Jupyter
category: gear
sidebar_position: 8
---

import Media from '@site/src/components/Media';

在 [通过 SSH 连接运行中的 Jupyter 执行](/docs/gear/ssh) 中介绍了通过 ssh 协议连接运行中的 Jupyter 的方法，除此之外 OpenBayes 中的 Jupyter 服务也可以直接通过 Jupyter Server 的 URL 直接连接。这样就可以让本地的 `.ipynb` 文件使用 OpenBayes 中的 Python 环境以及 GPU 资源了。

## 在 VS Code 中远程连接 OpenBayes Jupyter Server

<Media
  url='/video/docs/vs-code-remote-jupyter-server.mp4'
  type='video'
  loading='lazy'
  controls
/>

1. 需要安装 Jupyter 插件。
  ![](/img/docs/install-jupyter-plugin-in-vs-code.png)

2. 打开「命令面板」选择「Jupyter: 指定本地或远程 Jupyter 服务器的连接」
  ![](/img/docs/select-jupyter-server-in-vs-code.png)

3. 点选「现有的」:
  ![](/img/docs/select-existing-jupyter-server-in-vs-code.png)

4. 在运行中的容器页面点击「复制链接」拷贝 Jupyter Server 的链接。
  ![](/img/docs/copy-jupyter-server-link-in-container-page.png)

5. 粘贴链接到之前的 VS Code 命令面板中的对话框，**需要删除容器 ID 后的部分，否则将链接不成功**，然后按照提示重新加载页面。
  ![](/img/docs/copy-jupyter-server-link-into-vs-code.png)

  获取的链接为：

  ```
  https://openbayes.com/jobs/xushanchuan/jobs/iay6ih7xrgal/lab/tree/home
  ```

  需要删除 ID 之后的部分：

  ```
  https://openbayes.com/jobs/xushanchuan/jobs/iay6ih7xrgal
  ```

6. 在 VS Code 中创建 test.ipynb 文件，输入下图内容点击执行会提示选择内核，指向默认提示的内核即可。
  ![](/img/docs/run-import-in-vs-code-via-remote-jupyter-server.png)


## 在 PyCharm 中远程连接 OpenBayes Jupyter Server

<Media
  url='/video/docs/pycharm-remote-connect-jupyter.mp4'
  type='video'
  loading='lazy'
  controls
/>

### 连接 Jupyter 服务器

1. 在本地创建一个 Python 项目，并在项目下创建一个 `test.ipynb` 文件。打开文件后点击顶部位置选择「Configure Jupyter Server...」。
  ![](/img/docs/config-jupyter-server-in-pycharm.png)

2. 在弹出窗口中选择「Configured Server」并从运行中的容器页面点击「复制链接」拷贝到这里，**需要删除容器 ID 后的部分，否则将链接不成功**。
  ![](/img/docs/copy-jupyter-server-url-to-pycharm.png)

  ![](/img/docs/copy-jupyter-server-link-in-container-page.png)

  在上图获取的链接为：

  ```
  https://openbayes.com/jobs/xushanchuan/jobs/iay6ih7xrgal/lab/tree/home
  ```

  需要删除 ID 之后的部分：

  ```
  https://openbayes.com/jobs/xushanchuan/jobs/iay6ih7xrgal
  ```

3. 创建新的代码块，测试是否链接成功。
  ![](/img/docs/test-jupyter-server-in-pycharm.png)

### 支持自动补全

在实现 Jupyter 服务器的连接后发现其实没有任何的语法检查和自动补全。需要按照文档 [Configure an interpreter using SSH](https://www.jetbrains.com/help/pycharm/configuring-remote-interpreters-via-ssh.html) 添加 remote interpreter。上文的视频中有详细的步骤。
