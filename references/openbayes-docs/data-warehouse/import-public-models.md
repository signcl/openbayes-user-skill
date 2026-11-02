---
title: 导入公开模型
description: 当平台的公共模型中没有你需要的模型时，从 ModelScope 或 Hugging Face 下载并存入自己的模型仓库
category: data-warehouse
sidebar_position: 7
---

想在 OpenBayes 上使用某个开源模型（如 Qwen、DeepSeek、Llama）时，推荐的顺序是：

1. **先在「公共模型」中搜索**。平台已经收录了大量常用模型，可以直接只读绑定到容器使用，不占用你的存储空间，也不需要等待下载。
2. 确实没有收录，再按本文的方式从 ModelScope 或 Hugging Face 下载，并存入你自己的模型仓库。

本文介绍第二种情况。

## 先确认公共模型中是否已有

在控制台的「公共模型」中按模型名称搜索，例如 `Qwen3`、`DeepSeek-R1`。如果找到了，直接在创建容器时把它绑定到 `/openbayes/input/input0` 即可，不必往下读。

公共模型的介绍见 [公共资源概览](/docs/open-resources/)，绑定方式见 [算力容器数据绑定](/docs/gear/databinding/)。

## 选择下载来源

- **ModelScope（推荐）**：托管在国内，容器直接访问速度快，不需要配置任何镜像。
- **Hugging Face**：模型更全，但国内网络需要配合镜像站使用，见下文。

如果两边都有同一个模型，优先用 ModelScope。

## 决定下载到哪里

这是开始下载前最重要的决定，两种选择：

| | 方式一：直接下载到模型版本（推荐） | 方式二：下载到工作目录 |
|---|---|---|
| 做法 | 新建模型仓库和空版本，以**读写**方式绑定到 `/input0`，直接下载进去 | 下载到 `/output` |
| 优点 | 不占用工作目录空间；下载一次后任何容器都能只读绑定复用 | 简单，不需要重启容器 |
| 缺点 | 需要重启容器来建立绑定 | 占用工作目录空间；换个容器就要重新下载 |

:::caution 注意
超过 10 GB 的模型请不要用方式二。工作目录的容量有限，大模型很快就会占满，而且每次容器启停都要同步这些数据，要等很久。
:::

即使是小模型，只要之后还会在别的容器里用到，方式一也更划算，下载一次就能一直复用。

## 方式一：直接下载到模型版本

1. **新建模型仓库**，见 [模型管理](/docs/data-warehouse/models/)。
2. **创建一个空版本**，用来接收下载的数据。在模型页面点击「创建空版本」即可，也可以使用命令行 `bayes data new-version <模型 ID>`（模型和数据集在命令行里共用 `bayes data` 一组命令，把模型 ID 当数据集编号传即可，见 [用 bayes 上传数据](/docs/cli/upload-dataset/#创建一个空的数据集版本)）。
3. **以读写方式绑定到容器**。创建或重启容器时，把这个空版本绑定到 `/openbayes/input/input0`，绑定模式选择「读写」。读写绑定的说明见 [算力容器数据绑定#读写绑定](/docs/gear/databinding/#读写绑定)。
4. **在容器中执行下载**，下载目标目录写 `/input0`（见下文「下载命令」）。
5. **下载完成后关闭容器**。此后任何容器都可以只读绑定这个模型版本。

读写绑定的数据直接写入数据仓库，不经过工作目录，所以大模型用这种方式下载不会受工作目录容量的限制。

## 用便宜的算力下载

下载模型的过程只用网络和磁盘，完全用不到 GPU。如果你用 RTX 4090 或 A100 的容器下载一个几十 GB 的模型，这段时间的 GPU 费用是白花的。

推荐的做法：

1. 用最便宜的 CPU 算力创建容器，读写绑定空版本，执行下载；
2. 下载完成后关闭这个容器；
3. 再用 GPU 算力创建容器，把刚才的模型版本以**只读**方式绑定进来使用。

代价只是多一次容器切换，模型越大越值得。

## 下载命令

下面的 `<目标目录>` 按你选择的方式填写：方式一填 `/input0/<模型目录>`，方式二填 `/output/<模型目录>`。

### 从 ModelScope 下载

```bash
pip install --user modelscope

modelscope download --model <模型 ID> --local_dir <目标目录>
```

模型 ID 可以在 ModelScope 的模型页面复制，形如 `Qwen/Qwen3-8B`。

### 从 Hugging Face 下载

```bash
pip install --user -U "huggingface_hub[cli]" hf_xet

# 使用镜像站，解决国内网络无法访问的问题
export HF_ENDPOINT=https://hf-mirror.com

read -rsp "HF_TOKEN: " HF_TOKEN; echo  # 推荐：减少匿名限流
export HF_TOKEN
hf download <模型 ID> --local-dir <目标目录>
unset HF_TOKEN
```

:::note
`hf` 是 huggingface_hub 1.0（2025 年 10 月）后的命令行工具；较老镜像可能仍是 `huggingface-cli download`。不确定时执行上面的 `pip install --user -U`，统一用 `hf`。

新版 huggingface_hub 默认用 hf-xet 传输大文件，这是 Hugging Face 当前推荐路径。不要默认设置 `HF_HUB_DISABLE_XET=1`；只在 CAS / Xet bridge / CDN 错误时降级。

`hf_transfer` 已不再推荐；`HF_HUB_ENABLE_HF_TRANSFER` 已废弃。遇到 `hf_transfer` 403、分片或并发失败时，关闭它并改用 `hf` / hf-xet。
:::

如果报错出现 `xet`、`CAS`、`xet-bridge`、CDN 403、DNS 解析失败等字样，再用 `HF_HUB_DISABLE_XET=1` 降级重试。禁用 Xet 通常仍可下载，但会失去分块去重、增量下载和大文件优化。

### 用 tmux 挂到后台

大模型下载动辄几十分钟到几小时，网页版 Jupyter 或 SSH 一旦断开，前台运行的下载就会中断。建议用 `tmux` 把下载挂到后台，并把日志写到文件：

```bash
mkdir -p /output/logs

# ModelScope
tmux new -d -s model-download 'modelscope download --model <模型 ID> --local_dir <目标目录> 2>&1 | tee /output/logs/download.log'

# Hugging Face（不需要 token 时）
tmux new -d -s model-download 'export HF_ENDPOINT=https://hf-mirror.com; \
  hf download <模型 ID> --local-dir <目标目录> 2>&1 | tee /output/logs/download.log'
```

如需在 `tmux` 中使用 `HF_TOKEN`，不要把 token 写进命令文本。先用 `tmux set-environment -g HF_TOKEN "$HF_TOKEN"` 传入，启动下载后立刻执行 `tmux set-environment -gu HF_TOKEN` 并 `unset HF_TOKEN`。

`tmux` 启动的是新 shell，前面 `export` 的变量不会自动带进去；镜像设置要写进 tmux 命令，token 用 `tmux set-environment` 传入。

之后随时可以查看进度：

```bash
tail -f /output/logs/download.log
```

也可以用 `tmux attach -t model-download` 回到下载会话。

:::caution 关闭容器前先确认下载是完整的
下载失败时 tmux 会话同样会结束，光看「会话没了」判断不出成功。关闭容器前先看日志末尾，再核对文件数量、总大小，并确认 `.safetensors` / `.bin` 核心权重不是几十 KB 的指针文件：

```bash
du -sh <目标目录>
ls -lah <目标目录>
find <目标目录> -type f \( -name "*.safetensors" -o -name "*.bin" \) -size -1M -print
```

如果最后一条命令打印出核心权重文件，通常说明下载不完整，需要重下或换用上面的 Xet 降级方式。

模型版本一旦转为只读，缺文件就只能重新建一个版本重下。
:::

## 常见问题

### 下载完成了，但模型版本里没有文件

只有用旧版 `huggingface-cli`（huggingface_hub 0.23 之前）才会遇到：它默认把文件存到 `~/.cache`，在目标目录里只放软链接，真正的数据没有落到绑定的目录里。加上 `--local-dir-use-symlinks False` 可以避免：

```bash
huggingface-cli download <模型 ID> --local-dir <目标目录> --local-dir-use-symlinks False
```

升级到新版本（`pip install --user -U huggingface_hub`）就不用管这个问题了：下载到本地目录已经不再使用软链接，这个参数也随之废弃。

### 用 Python 下载时目录结构不对

如果命令行工具用起来不顺，可以用 Python SDK。两个库都提供 `snapshot_download`，下面这种「模型 ID + `local_dir`」的用法在两边是一样的（其余参数各有差异，用到时查各自文档）：

```python
from modelscope import snapshot_download  # 或 from huggingface_hub import snapshot_download

snapshot_download('<模型 ID>', local_dir='<目标目录>')
```

`<目标目录>` 同样按上面的选择填写：方式一是 `/input0/<模型目录>`，方式二是 `/output/<模型目录>`。

注意要用 `local_dir` 而不是 `cache_dir`。`cache_dir` 会生成 `models--org--name/snapshots/<hash>/` 这样的缓存目录结构，而不是你期望的扁平目录。

### 下载中断了怎么办

两个命令行工具都支持断点续传，重新执行同样的下载命令即可，已经下载完成的文件会被跳过。

## 下一步

模型入库后，如果要把它部署成可调用的推理服务，见 [模型部署快速上手](/docs/serving/getting-started/)。
