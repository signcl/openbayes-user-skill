---
title: Jupyter 工作空间
category: gear
sidebar_position: 2
---

「Jupyter 工作空间」（后面也会直接称为「工作空间」）是 OpenBayes 提供的交互式开发环境。本质上，它是 `Job(mode=WORKSPACE)` 的一种运行形态：

- 提供了 JupyterLab 为入口的交互式环境，易于使用的界面适合各种数据科学和机器学习任务。
- 运行中的工作空间也支持通过 SSH 连接，便于远程开发。
- 支持「重启」功能，便于恢复之前的工作状态而不会创建新的执行实例，避免存储空间重复占用问题。
- 每次启动都会自动绑定之前的「工作目录」内容，并允许按当前执行类型与配置约束调整算力、数据绑定等设置。

## 基本界面

在单次执行的页面点击「打开 Jupyter 工作空间」进入如下的界面：

![](/img/docs/gear-workspace-1.png)

其中右侧的侧边栏展示了当前执行的一些基本信息，包括[系统指标](/docs/gear/metrics/#展示关键的-metrics)、执行的基本信息（算力类型、运行环境、运行时间）以及设置界面。其中通过系统指标可以了解到当前执行是否在有效的利用系统所提供的计算资源。在执行打开后也会默认弹出 `openbayes-intro.ipynb` 文件包含了 OpenBayes Jupyter 工作空间的一些基本介绍。

虽然在 JupyterLab 页面的左侧文件导航栏的头部显示的目录为 `/home`，但这并不是系统中的 `/home` 目录，而是 JupyterLab 相对其根目录展示出来的路径。OpenBayes 将 JupyterLab 的根目录设置为 `/openbayes`，因此当你在 JupyterLab 中看到 `/home` 时，实际对应的是系统里的 `/openbayes/home`。

左侧文件导航栏无法展示 `/openbayes` 以外的目录内容。如果需要保存其他目录中的文件，请通过 JupyterLab 的 Terminal 命令行将其拷贝到 `/openbayes/home` 目录。

## 工作空间里的目录如何理解

在工作空间里，下面几组路径最容易让新用户混淆：

- JupyterLab 里看到的 `/home`
- 容器里的 `/openbayes/home`
- 创建 Job 时常写的 `/output`
- 数据绑定里常见的 `/input0` ~ `/input4`
- 容器里的 `/openbayes/input/input0` ~ `/openbayes/input/input4`

它们的对应关系可以直接记成：

- JupyterLab 里的 `/home`，实际对应容器里的 `/openbayes/home`
- `/output` 等价于 `/openbayes/home`
- `/input0` 等价于 `/openbayes/input/input0`
- `/input1` 等价于 `/openbayes/input/input1`
- `/input2` 等价于 `/openbayes/input/input2`
- `/input3` 等价于 `/openbayes/input/input3`
- `/input4` 等价于 `/openbayes/input/input4`

可以把它理解为两类目录：

- `/output` / `/openbayes/home`：当前工作空间自己的工作目录，适合保存代码、Notebook、模型、结果文件
- `/input*` / `/openbayes/input/input*`：绑定进来的输入目录，适合读取数据集、预训练模型、其他 Job 的输出

一个最常见的用法是：

```text
从 /input0 读取训练数据
从 /input1 读取预训练模型
在 /output 保存代码修改、checkpoint 和最终产物
```

如果你只是消费大数据集，通常建议把它们挂到 `/input*`，而不是拷贝进 `/output`。这样更容易保持工作目录清晰，也能减少后续重启时需要同步的数据量。

## Jupyter 工作空间的创建

创建工作空间的流程如下，在选择「接入方式」时，选择「Jupyter 工作空间」：

![](/img/docs/gear-workspace-2.png)

:::note
在创建执行时的「数据绑定」阶段，工作空间可以进行数据绑定，文档见[「数据绑定」](/docs/gear/databinding/)。
:::

执行启动后，其界面如下：

![](/img/docs/gear-workspace-3.png)

![](/img/docs/gear-workspace-4.png)

## 执行长时间训练

机器学习尤其是深度学习的训练任务通常会需要比较长的运行时间，但是作为一个交互式的编程环境，工作空间并不非常适合这种场景。

**虽然在工作空间执行的程序即使关闭网页，程序依然会运行**，但是在工作空间下运行长时间的任务会有如下两个问题：

1. 长时间任务在运行时一旦网络出现波动会导致其运行的日志打印中断，导致无法查看到目前训练的进度
2. 长时间任务在 Jupyter 工作空间中执行时即使任务执行完毕了或者由于某些原因报错了，工作空间不会立即关闭，但是计费还在继续导致计算资源的浪费

因此如果需要执行长时间的训练任务，建议查看 [Task 与 Jupyter 工作空间结合](/docs/gear/#task-与-jupyter-工作空间两种模式结合使用)部分采用 task 执行长时间任务。不过这里依然提供两个对应的解决方案：

### 使用 Log Console 找到丢失的日志

这里通过一个简单的代码片段模拟一个长时间运行的任务：

```python
import time

for i in range(100000):
    print(i)
    time.sleep(1)
```

将该段代码在一个 `.ipynb` 文件中执行看到如下的日志信息：

![](/img/docs/2020-02-05-18-51-41.png)

这个代码块会一直更新日志，但是如果我们刷新页面后再回来会发现日志不再更新了。这个时候在该代码块中右键点击「Show Log Console」打开当前的 Log Console 界面。

![](/img/docs/2020-02-05-18-54-00.png)

然后选择 Debug 级别的日志就可以看到之前的日志进度了：

![](/img/docs/2020-02-05-18-55-13.png)

### 使用日志重定向保存日志到文件并配合 `tail` 命令查看最新的日志内容

对于通过 `Terminal` 执行的长任务，可以将日志重定向一个特定的文件，并通过 `tail -f` 的命令查看日志：

```sh
# 将 python train.py 的输出重定向到 train.log 文件中
python train.py > train.log 2>&1 &

# 通过 tail -f 命令查看 train.log 文件的内容
tail -f train.log
```

## Jupyter 工作空间的自动关闭

由于「工作空间」在开启之后就开始计费了，为了减少因为忘记关闭而带来的计算资源的浪费。OpenBayes 默认为容器里添加了「工作空间」超时自动关闭的设置。

OpenBayes 会结合 JupyterLab 的活跃状态和系统资源使用情况来判断工作空间是否空闲，而不是只看某一个单独条件。

在「容器」的「设置」选项卡可以看到「JupyterLab 闲置自动关闭设置」，可以设置工作空间空闲多久后自动关闭，默认时长为 30 分钟。当系统判断工作空间进入空闲状态后，会先向创建者发送提醒；如果之后仍然保持空闲，系统会自动关闭该工作空间。有关通知方式可以在 [gear#设定通知](/docs/gear#设定通知) 中进行配置。

:::caution 注意 非常重要！
判断工作空间是否仍在被使用，会参考 JupyterLab 提供的活跃状态信息。我们不会记录用户的编辑内容。如果工作空间页面仍保持活跃，系统通常不会触发空闲关闭。

工作空间页面关闭不会导致已经在运行的程序出现中断，因此如果确实需要在工作空间中执行长任务，又希望程序运行完触发空闲关闭，可以直接关闭页面。

有的时候工作空间虽然没有关闭但是电脑自身锁定或者睡眠也会让 OpenBayes 认为容器是不活跃的了，但是这种情况和每个人的电脑设定有关，如果希望触发空闲关闭不浪费计算资源还是建议关闭页面。
:::

![](/img/docs/gear-workspace-5.png)

当容器由于空闲时长而被自动关闭时，OpenBayes 会在容器的状态上显示「超时关闭」。

## Jupyter Kernel 内核的重启

每次在 Jupyter 工作空间中打开一个 `.ipynb` 文件后系统会对应的创建一个名为 `kernel` 的后台负责执行在页面提交的代码。如果发现自己的 `.ipynb` 文件执行命令出现了问题，最简单的处理方法就是重启对应的 `kernel`：

![](/img/docs/2020-02-05-19-00-07.png)

## 注册自定义 Kernel

默认情况下 Notebook 使用的是运行时自带的 Python 环境。如果你在容器里另外创建了独立的 Python 环境（用 Conda 或 uv），希望在**同一个 Jupyter 工作空间**里直接切换到这个环境来跑 Notebook，就需要把它**注册成一个 Kernel**。

### Kernel 与 kernelspec 是什么

- **Kernel**：真正执行 Notebook 代码的后台解释器进程。一个 Python 环境只要装了 [`ipykernel`](https://github.com/ipython/ipykernel) 包，就能被注册成一个可选的 Kernel，之后在 Notebook 右上角的 Kernel 列表里切换。
- **kernelspec**：Jupyter 用来记录"某个 Kernel 怎么启动"的一份注册信息，落在磁盘上是一个目录，核心是里面的 **`kernel.json`** 文件。它的关键字段：
  - `argv`：Jupyter 启动这个 Kernel 时**实际执行的命令**（第一个元素就是该环境的 python 路径）。注意 Jupyter 是**直接执行这条命令**来拉起 Kernel 的，并不会先 `conda activate` / `source activate`——这一点在做环境隔离时很重要。
  - `display_name`：Kernel 列表里显示的名字。
  - `language`：语言，这里是 `python`。

### 注册流程

在目标环境里装好 `ipykernel`，再用 `ipykernel install` 注册即可。以自定义环境名为 `myenv` 为例，命令的骨架是：

```bash
# 先激活你的自定义环境（Conda 用 conda activate，uv 用 source .../activate）
python -m ipykernel install --user --name=myenv --display-name="Python (myenv)"
```

**重新打开 Jupyter 工作空间页面后**，就能在 Kernel 列表里看到新增的 `Python (myenv)`。

具体到不同运行时，激活环境与安装依赖的命令不同，且**自定义环境的 Kernel 是否会与默认环境相互污染**也需要区别处理，请分别参考：

- Conda 运行时（Ubuntu 22.04 及更早）：[将新创建的 Conda 与 Jupyter 工作空间集成](/docs/gear/conda#将新创建的-conda-与-jupyter-工作空间集成)
- uv 运行时（Ubuntu 24.04 及更新）：[将新创建的环境与 Jupyter 工作空间集成](/docs/gear/uv#将新创建的环境与-jupyter-工作空间集成)

### 查看已注册的 Kernel

用下面的命令列出当前所有已注册的 Kernel 及其 kernelspec 的**真实路径**（同名 Kernel 可能存在多份，排查时以这里列出的路径为准）：

```bash
jupyter kernelspec list
```

:::note
用 `--user` 注册的 kernelspec 保存在**持久化的用户目录**下，容器重启后依然有效，**无需重新注册**（环境本身也在 `/openbayes/home` 下，一并保留）。

反过来，如果注册时**没加 `--user`**、把 kernel 装进了运行时自带的 Python 前缀（如 `/usr/local`、`/opt/venv`），那部分不在持久化目录下，重启后会丢失、需要重装——所以推荐始终带 `--user`。
:::

## Jupyter 工作空间的重启

在工作空间关闭之后可以再次启动。目前工作空间支持两种模式的启动：「快速启动」和「修改配置并启动」。

### 快速启动

点击页面上的「启动」进行快速启动，默认保留上一次执行的主要配置（算力、运行时环境、环境变量等），并自动绑定上一次运行时「工作目录」中的数据。其中 Secret 类型的环境变量会沿用上一次保存的真实值，无需重新输入。

![](/img/docs/gear-workspace-6.png)

### 修改配置并启动

如果需要修改配置可以点击「启动」右侧的箭头：

![](/img/docs/gear-workspace-7.png)

之后可以按照流程修改算力、数据绑定、环境变量等信息；是否可以调整运行时环境（镜像）取决于当前工作空间类型与配置。环境变量中的 Secret 变量会以脱敏、只读的形式默认沿用，如需更换可点击该变量的「替换」输入新值。

关于环境变量的明文 / Secret 两种类型，以及克隆、修改类型等场景下的处置方式，详见[环境变量与 Secret 变量](/docs/gear/env-vars/)。

## Jupyter 工作空间的高速缓存机制

- 每位用户可创建的工作空间个数不受限制，但我们为每位用户提供的可缓存的工作空间的个数是有限的
- 创建工作空间时，默认都会被高速缓存，被缓存的工作空间会在界面上额外显示一个闪电图标
- 当达到当前用户可保存的高速缓存上限后，会将旧的被缓存的工作空间降级为普通工作空间。被缓存工作空间降级时，总是会优先删除上次关闭时间距离现在最远的那个（最早的一个）
- 被缓存的工作空间在关闭后有最大的缓存时间，超过这个时间后，即使没有创建新的工作空间，也会被降级为普通的工作空间
- 被缓存的工作空间在功能上与普通的工作空间没有任何区别，只是在启动速度上存在差异

![](/img/docs/gear-workspace-8.png)

## 为工作空间建立快照

创建「快照」可以将当前工作空间的「工作目录」保存下来，作为一个固定的版本，以便在未来使用：

![](/img/docs/gear-workspace-10.png)

快照创建后依据「工作目录」规模大小需要一定的拷贝时间，工作空间「工作目录」越大，所需要拷贝的时间就越久。

![](/img/docs/gear-workspace-11.png)

快照会记录工作空间所使用的「算力类型」「数据绑定」「镜像类别」，通过「继续执行」可以从这个快照启动新的「工作空间」，默认沿用快照所记录的以上配置并将快照的「工作目录」拷贝到新的工作空间的 /openbayes/home 目录下：

![](/img/docs/gear-workspace-12.png)

快照模式需要注意的几点：

- 用户只有在工作空间处于「正在运行」和「已关闭」两种状态下可以创建快照
- 快照所占用的空间即为标准的存储空间费用，无额外的其他费用，将不再使用的快照删除将释放相应的存储空间
- 创建快照时尽量避免对运行中的工作空间执行文件写入 / 修改操作，以防生成的快照与期望内容不一致
