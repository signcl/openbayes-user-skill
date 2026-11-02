---
title: 自定义端口映射与服务暴露
description: 如何将 OpenBayes 容器内的服务暴露到外部网络
category: gear
sidebar_position: 10
---

<iframe width="100%" height="540px" src="//player.bilibili.com/player.html?isOutside=true&aid=114098222203260&bvid=BV1Wo9BYoEDk&cid=28670756679&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>

## 功能概述

OpenBayes 的「模型训练」提供自定义端口映射功能，可以将容器内运行的服务（如 Web 应用、API 服务、可视化工具或大语言模型）暴露到外部网络。此功能是算力容器的核心特性之一，适用于工作空间和批量任务等多种场景，专为提升开发体验和服务部署效率而设计。

:::important 实名认证要求
使用自定义端口映射功能需要完成实名认证。未完成实名认证的用户将无法使用此功能。请在使用前确保您已完成实名认证流程。
:::

此功能支持：

- 同时暴露 Gear 容器内的多个端口
- 通过格式化的子域名访问服务
- 支持 HTTP、WebSocket 等多种协议

## 配置端口映射


### 创建 Gear 容器时设置

在创建新的 Gear 容器时，可以在「端口映射」部分配置要暴露的端口：

![增加端口映射](2025-02-28-19-28-09.png)

配置步骤：

1. 在「创建容器」页面，找到「端口映射」部分
2. 点击「配置端口映射」按钮
3. 填写以下信息：
   - **映射名称**：端口映射的唯一标识名
   - **端口号**：容器内服务监听的端口

默认情况下，Job 的 `8080` 端口已经对外暴露，通常不需要再手动配置该端口映射。页面中的「API 地址」访问的就是这个 `8080` 服务。

:::caution 注意
不同的容器的映射名称不能重复设置，否则会产生报错。
:::

### 端口映射限制

- 保留端口（无法进行映射）：22、80、5901、6006、6637、7088、8888
- 每个 Gear 容器最多可配置 5 个自定义端口映射

## 访问方式

Gear 容器状态显示为「运行中」后，系统会自动生成访问地址。

### 子域名访问

子域名访问方式的格式取决于是否提供了端口映射名称：

#### 提供了映射名称时

```text
https://{user}-{port_name}.{domain}
```

参数说明：

- `{user}` - 用户名
- `{port_name}` - 为端口映射指定的名称
- `{domain}` - OpenBayes 实例的基础域名

示例：用户名为 `openbayes`，端口映射名称为 `gradio`，基础域名为 `gear-c1.openbayes.net`，则访问地址为：

```text
https://openbayes-gradio.gear-c1.openbayes.net
```

#### 未提供映射名称时

```text
https://{user}-{jobid}-{port_number}.{domain}
```

参数说明：

- `{user}` - 用户名
- `{jobid}` - Gear 容器的作业ID
- `{port_number}` - 容器内部端口号
- `{domain}` - OpenBayes 实例的基础域名

示例：用户名为 `openbayes`，容器 jobid 为 `84xr8451agrz`，内部端口为 `7860`，基础域名为 `gear-c1.openbayes.net`，则访问地址为：

```text
https://openbayes-84xr8451agrz-7860.gear-c1.openbayes.net
```

### 查看配置的访问地址

Gear 容器详情页面可查看所有配置的端口映射及其访问地址：

![容器端口映射页面](container-port-mapping.png)

## 应用示例

### 部署 Gradio 应用

以下是在 OpenBayes Gear 上部署并暴露 Gradio 应用的步骤：

1. 安装 Gradio：

```bash
pip install gradio --user
```

2. 创建应用文件 `app.py`：

```python
import gradio as gr

def greet(name):
    return "Hello " + name + "!!"
 
demo = gr.Interface(fn=greet, inputs="text", outputs="text")
# 必须绑定到 0.0.0.0 才能从外部访问
demo.launch(server_name="0.0.0.0", server_port=7860)
```

3. 运行应用：

```bash
python app.py
```

4. 通过之前配置的端口映射访问应用（假设端口 7860 已配置为 "gradio" 端口映射）。

### 部署大语言模型 API 服务

#### vLLM 服务

```bash
# 使用自定义端口启动服务
vllm serve <model> \
    --host 0.0.0.0 \
    --port 8080
```

#### SGLang 服务

```bash
# 启动服务并指定端口
python -m sglang.launch_server \
    --model-path <path> \
    --host 0.0.0.0 \
    --port 8080
```

### 使用 OpenAI 兼容接口访问 LLM 服务

如果您在 Gear 中部署的 LLM 服务（如 vLLM、SGLang）提供了 OpenAI 兼容的 API，可以通过以下方式访问：

1. 获取可用模型列表：

```text
https://{user}-{port_name}.{domain}/v1/models
```

或者（如果未指定映射名称）：

```text
https://{user}-{jobid}-{port_number}.{domain}/v1/models
```

2. 使用 Python OpenAI SDK 访问：

```python
from openai import OpenAI

# 根据您的访问方式选择对应的基础 URL
# 提供了映射名称：
base_url = "https://{user}-{port_name}.{domain}/v1"
# 未提供映射名称：
# base_url = "https://{user}-{jobid}-{port_number}.{domain}/v1"

model_name = "your-model-name"  # 从 /v1/models 获取的模型名

client = OpenAI(
    base_url=base_url,
    api_key="EMPTY"  # 许多开源模型服务不需要真正的 API Key
)

# 发送请求
response = client.chat.completions.create(
    model=model_name,
    messages=[
        {"role": "user", "content": "你好"}
    ]
)
print(response.choices[0].message.content)
```

## 端口映射与 SSH 隧道对比

自定义端口映射相比 SSH 隧道方法的优缺点：

| 特性 | 自定义端口映射 | SSH 隧道 |
| --- | --- | --- |
| 配置方式 | UI 界面操作 | 命令行和 SSH 密钥 |
| 多端口支持 | 支持同时暴露多个端口 | 每个端口需单独配置 |
| 持久性 | Gear 运行期间持续可用 | 需保持 SSH 连接 |
| 访问范围 | 公网可直接访问 | 仅在有 SSH 隧道的机器上可访问 |
| 协议支持 | HTTP, WebSocket 等 | 所有 TCP 协议 |
| 安全机制 | HTTPS 加密 | SSH 加密 |

## 安全性考虑

使用「模型训练」的自定义端口映射时请注意：

1. 暴露的服务可被任何知道 URL 的人访问，除非应用实现了身份验证
2. 避免暴露包含敏感数据的服务
3. 建议在应用中实现适当的安全措施（如身份验证和授权）

