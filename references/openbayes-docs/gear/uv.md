---
title: 用 uv 管理 Python 环境
category: runtimes-idx
sidebar_position: 9.5
---

:::info
这里介绍的是用 uv 创建一个完全独立的 Python 环境，通常意味着你需要一个与运行时自带的 Python 不同版本的环境，或者想为某个项目完全隔离依赖。如果只是想安装几个额外的包，不需要创建独立环境——`pip install --user <package>` 即可，安装的包会保存在工作空间中，重启后依然可用，可以参考文档 [保留 pip 依赖](/docs/runtimes#保留-pip-依赖)。
:::

较新的 Ubuntu 24.04 运行时（如 `vllm 0.20` 及之后、`pytorch 2.11` 及之后）使用 [uv](https://docs.astral.sh/uv/) 管理 Python，不再内置 Conda。运行时自带的默认 Python 环境位于 `/opt/venv`。

:::caution
直接用 `uv pip install <包名>` 会把包装进自带的 `/opt/venv`，可以立即使用，但该目录不在持久化目录下，容器重启后会丢失。需要重启后保留时：只装少量包用 [`pip install --user`](/docs/runtimes#保留-pip-依赖)（uv 不支持 `--user`，这一步用系统自带的 `pip`）；需要独立环境则按下文在 `/openbayes/home` 下创建。
:::

判断当前运行时使用的是 uv 还是 Conda：

```bash
$ uv --version        # 能输出版本号即为 uv 运行时，使用本文
$ conda --version     # 能输出版本号即为 Conda 运行时，参考「用 Conda 进行依赖管理」
```

## 使用 uv 创建新的环境

### 1. 在 `/openbayes/home` 下创建一个新的环境

```bash
cd /openbayes/home
uv venv myenv
```

通常几秒钟即可完成。然后激活新的环境：

```bash
source /openbayes/home/myenv/bin/activate
```

:::note
能够保存环境的关键在于将环境创建在 /openbayes/home 下。容器重启后，重新执行上面的 source 命令即可继续使用这个环境。
:::

### 2. 在环境中安装依赖

激活环境后使用 `uv pip install` 安装依赖：

```bash
uv pip install torch torchvision
uv pip install -r requirements.txt
```

:::info
在自建的独立环境中安装依赖时**不要**添加 `--user` 参数。这里要区分两种命令：普通的 `pip install --user` 会把依赖装到 `/openbayes/home/.pylibs` 而不是新创建的环境中，容易引发依赖冲突；而 `uv pip` 本身**不支持** `--user`，加上后会直接报错（`error: pip's --user is unsupported`），并不会真的安装。所以用 `uv pip install` 时保持默认、不加 `--user` 即可。

好在 `uv venv` 创建的环境默认关闭 user-site（`ENABLE_USER_SITE=False`），正常用 `uv pip install` 安装时不会读写 `/openbayes/home/.pylibs`，即使与默认环境是同一个 Python 版本也不会互相污染。这一点与 Conda 运行时不同，Conda 环境默认启用 user-site，需要额外注意，详见[用 Conda 进行依赖管理](/docs/gear/conda)。
:::

### 3. 需要不同的 Python 版本

uv 可以下载任意版本的 Python，但请务必先把下载位置指定到工作空间内，否则容器重启后解释器会丢失、整个环境失效：

```bash
export UV_PYTHON_INSTALL_DIR=/openbayes/home/.uv/python
uv venv myenv --python 3.11
```

:::caution
`export` 设置的环境变量只对当前终端会话有效。之后（包括容器重启后）再创建其他 Python 版本的环境时，请先重新执行上面的 export 命令——遗漏的话，新创建的环境会在下一次重启后失效。

已经创建好的环境不受影响：解释器已保存在工作空间内，重启后直接 `source` 激活即可继续使用。
:::

使用运行时自带的 Python 版本创建环境时（不指定 `--python` 或与自带版本一致），无需设置该变量。

## 将新创建的环境与 Jupyter 工作空间集成

:::info
关于 Kernel / kernelspec / `kernel.json` 是什么、`jupyter kernelspec list` 如何查看、以及注册信息在容器重启后是否保留等**通用概念**，见[注册自定义 Kernel](/docs/gear/workspace#注册自定义-kernel)。本节只讲 uv 运行时特有的注册命令与隔离说明。
:::

与 Conda 环境类似，在环境中安装 ipykernel 并注册为 Jupyter kernel，即可在同一个 Jupyter 工作空间中切换使用不同的环境：

```bash
source /openbayes/home/myenv/bin/activate
uv pip install ipykernel
python -m ipykernel install --user --name=myenv --display-name="Python (myenv)"
```

**重新打开 Jupyter 工作空间页面后**即可在 kernel 列表中看到新增的选项。

:::note
用 `--user` 注册的 kernelspec 保存在**持久化的用户目录**下，容器重启后依然有效，无需重新注册（环境本身也保存在工作空间中，一并保留）。
:::

:::info
uv venv 注册的 kernel 不需要额外处理就与默认环境隔离。因为 `uv venv` 创建的环境默认关闭 user-site（`ENABLE_USER_SITE=False`），而且这个设置写在环境本身、不依赖激活，所以即使 Jupyter 直接执行环境的 python 启动 kernel（不经过 `source .../activate`），也读不到 `/openbayes/home/.pylibs` 里默认环境用 `pip install --user` 装的包。

这一点与 Conda 运行时不同：Conda 环境默认启用 user-site，注册的 kernel 需要在 `kernel.json` 的 `argv` 里额外加 `-s` 才能隔离，详见[用 Conda 进行依赖管理](/docs/gear/conda)。可以在 Notebook 里跑一句确认当前 kernel 是隔离的（结果应为空 `[]`）：

```python
import sys; print([p for p in sys.path if ".pylibs" in p])
```
:::
