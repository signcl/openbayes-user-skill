---
title: 用 Conda 进行依赖管理
category: runtimes-idx
sidebar_position: 9
---

:::caution
本文适用于内置 Conda 的运行时（基于 Ubuntu 22.04 及更早，如 `pytorch 2.10` 及之前、`vllm 0.19` 及之前）。较新的 Ubuntu 24.04 运行时（如 `vllm 0.20` 及之后、`pytorch 2.11` 及之后）不再内置 Conda，创建独立环境请参考 [用 uv 管理 Python 环境](/docs/gear/uv)。

不确定当前运行时属于哪一种时，在终端执行 `conda --version`：能输出版本号即可使用本文；提示 `command not found` 则请使用 uv。
:::

:::info
这里介绍的用 Conda 依赖管理是完完全全创建一个独立的环境，通常意味着你需要一个与系统自带的 Python 不同版本的环境。如果没有这个需求也就不用创建一个独立的环境了。通过 `pip install --user` 的方式完全可以做到，可以参考文档 [在默认的-python-版本下安装额外的依赖](/docs/runtimes#2-在默认的-python-版本下安装额外的依赖)。
:::

OpenBayes 中的 Python 是通过 Conda 进行管理的，默认的安装环境路径可以通过以下命令获取：

```bash
$ conda env list

# conda environments:
#
base                  *  /usr/local
```

可以看到默认的环境在 `/usr/local` 中，每个环境中的依赖可以通过 `conda list` 获取，在文档左侧「运行时环境」下也提供了完整的安装依赖列表。

## 使用 Conda 创建新的环境

### 1. 在 `/openbayes/home` 下创建一个新的环境

```bash
conda create -p open-mmlab python=3.9 -y
```

安装完成后通过 `conda activate /openbayes/home/open-mmlab` 激活新的环境。

:::note
能够保存环境的关键在于将新的环境的保存路径存放在 /openbayes/home 下，通过「继续执行」可以将这部分内容再次绑定到一个新的执行之中。
:::

### 2. 按照[文档](https://github.com/open-mmlab/mmdetection/blob/master/docs/get_started.md)安装其他依赖

```bash
conda install pytorch torchvision -c pytorch

git clone https://github.com/open-mmlab/mmdetection.git
cd mmdetection

# 按照官方文档继续安装
pip install mmcv
pip install -r requirements/build.txt
pip install "git+https://github.com/cocodataset/cocoapi.git#subdirectory=PythonAPI"
pip install -v -e .  # or "python setup.py develop"
```

完成安装后，mmdetection 相关的依赖被安装到了 `/openbayes/home/open-mmlab`（也就是 `/output/open-mmlab` 下。

![](/img/docs/2020-04-28-17-35-02.png)

### 3. 通过继续执行打开原有的执行

通过「继续执行」的方式将上一次准备的 mmdetection 的环境绑定到新的执行里运行，通过命令 `conda activate /openbayes/home/open-mmlab/` 可以再次激活上一次配置好的环境继续使用了。

## 注意：新环境里安装依赖不要用 `--user`（会污染默认环境）

在新建的 Conda 环境里安装依赖时，请使用普通的 `pip install`（或 `conda install`），**不要加 `--user`**。

原因是：`--user` 装的包会进入 `PYTHONUSERBASE`（即 `/output/.pylibs`）下**按 Python 小版本命名**的目录，例如 `/output/.pylibs/lib/python3.10/site-packages`。这个目录被**所有相同 Python 小版本的环境共享**，而 Conda 环境默认启用 user-site（`ENABLE_USER_SITE=True`）会读取它。

因此，当默认（base）环境和你新建的环境**恰好是同一个 Python 小版本**时，在新环境里用 `--user` 安装，会直接覆盖默认环境里同名的包——典型现象是「在新环境装了某个版本后，默认环境里的版本也跟着被改掉了」。

需要注意的是：**不加 `--user` 只能避免继续「写入」共享目录**。由于 Conda 环境默认仍会把共享的 user-site 加进 `sys.path`，新环境依然可能「读到」默认环境里通过 `--user` 装的包。要与默认环境真正隔离，需采用下面任一方案。

正确做法（任选其一）：

- **推荐：让新环境使用与默认环境不同的 Python 小版本。** 例如默认是 3.10，新环境用 `conda create -p /openbayes/home/myenv python=3.11`。user-site 目录随之分开（`.../python3.11/...`），两个环境互不影响。
- **必须使用相同 Python 版本时：在新环境里关闭 user-site。** 创建后执行：

  ```bash
  conda env config vars set PYTHONNOUSERSITE=1 -p /openbayes/home/myenv
  conda activate /openbayes/home/myenv
  python -c "import site; print(site.ENABLE_USER_SITE)"   # 必须输出 False
  ```

  确认输出 `False` 后，再用普通 `pip install` 安装。普通 `pip install` 只会将包写入**当前环境**、并不会写进 `/output/.pylibs`；但只要 user-site 仍是 `True`，新环境一方面仍会**读到**默认环境里 `--user` 装的包，另一方面 pip 在升级同名包时可能把默认环境里的那份**卸载**掉。因此务必先确认已变为 `False` 再安装。

:::note
使用 uv 的运行时（Ubuntu 24.04 及更新）不受此影响：`uv venv` 创建的环境默认关闭 user-site，不会读写 `/output/.pylibs`，与默认环境天然隔离；且 `uv pip` 也不支持 `--user`。详见[用 uv 管理 Python 环境](/docs/gear/uv)。
:::

## 将新创建的 Conda 与 Jupyter 工作空间集成

Jupyter 工作空间可以与 Conda 集成以允许同一个 notebook 指定不同的 Conda 环境。按照以下步骤可以将一个自定义的 Conda 环境添加到 Jupyter 工作空间中。

:::info
关于 Kernel / kernelspec / `kernel.json` 是什么、`jupyter kernelspec list` 如何查看、以及注册信息在容器重启后是否保留等**通用概念**，见[注册自定义 Kernel](/docs/gear/workspace#注册自定义-kernel)。本节只讲 Conda 运行时特有的注册命令与隔离注意事项。
:::

```bash
conda activate /openbayes/home/open-mmlab/
(/openbayes/home/open-mmlab/)$ conda install ipykernel
(/openbayes/home/open-mmlab/)$ python -m ipykernel install --user --name=open-mmlab --display-name="Python (open-mmlab)"
```

**重新打开 Jupyter 工作空间页面后**可以看到有了额外的一个选项：

 ![](/img/docs/2020-04-28-17-45-50.png)

### 注意：注册的 Kernel 需要额外关闭 user-site

如果你按前面「新环境里安装依赖不要用 `--user`」一节里关闭 user-site 的方式（`conda env config vars set PYTHONNOUSERSITE=1`）隔离了新环境，要特别注意：**这个隔离在 Jupyter kernel 里不生效**。

原因是 `conda env config vars` 设置的变量**只在 `conda activate` 时才导出**，而 Jupyter 启动 kernel 是按 `kernel.json` 里的 `argv` **直接执行环境的 python，并不会 `conda activate`**。于是 `PYTHONNOUSERSITE` 没被设上，kernel 仍然启用 user-site、读到 `/output/.pylibs` 里默认环境用 `--user` 装的包——典型现象是「终端里 import 正常，Notebook 里却 import 到了默认环境的版本，甚至因依赖版本不匹配直接报错」。

解决办法是给这个 kernel 的启动命令加上 `-s` 参数。`-s` 是 Python 解释器的启动开关，作用是「启动时不加载 user site-packages 目录」（等价于 `PYTHONNOUSERSITE=1`，但它是启动参数，直接执行也生效，不依赖 `conda activate`）。

1. 先用下面命令找到 kernel.json 的真实路径（同名 kernel 可能有多份，以这里列出的为准）：

   ```bash
   jupyter kernelspec list
   ```

2. 编辑对应目录下的 `kernel.json`，在 `argv` 里 python 后面插入一个 `-s`：

   ```json
   {
    "argv": ["/openbayes/home/myenv/bin/python", "-s", "-m", "ipykernel_launcher", "-f", "{connection_file}"],
    "display_name": "myenv",
    "language": "python"
   }
   ```

3. **重启 kernel** 后生效。在 Notebook 里验证下面这句应为空（`[]`）：

   ```python
   import sys; print([p for p in sys.path if ".pylibs" in p])
   ```

也可以改成在 `kernel.json` 里加一段 `"env": {"PYTHONNOUSERSITE": "1"}`，效果相同；但推荐 `-s`，因为它是启动参数、不受环境变量合并或 kernelspec 加载顺序的影响，更稳。

:::note
uv 运行时不需要这一步：`uv venv` 创建的环境默认就关闭了 user-site，注册出来的 kernel 天然隔离，无需 `-s`。详见[用 uv 管理 Python 环境](/docs/gear/uv)。
:::
