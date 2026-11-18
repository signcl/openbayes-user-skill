---
title: 系统指标与自定义指标
category: gear
sidebar_position: 6
---

## 展示关键的 Metrics

OpenBayes 默认提供了执行时的关键指标的展示，目前支持的有 CPU 、内存、`gpu-0-memory`、`gpu-0-util` 以及 存储资源。未来将支持更多的指标。

![](/img/docs/gear-metrics-1.png)

### 自定义 Metrics

OpenBayes 提供一个 Python 的库 openbayestool 用于在 Python 程序中自定义记录一些关键的 metrics 并展示到用户的容器执行页面之上：

![](/img/docs/gear-metrics-2.png)

openbayestool 使用方式如下所示：

```py
from openbayestool import log_param, log_metric, clear_metric

# 记录参数 `learning_rate=0.01`
log_param('learning_rate', 0.01)

# 同一参数将会记录最后一个请求的结果 `foo=3`
log_param('foo', 1)
log_param('foo', 2)
log_param('foo', 3)

# 记录模型的运行结果 `precision=0.77`
log_metric('precision', 0.77)

# 同一个结果 precision 多次记录会追加结果，即结果为 [0.79, 0.82, 0.86]
log_metric('precision', 0.79)
log_metric('precision', 0.82)
log_metric('precision', 0.86)

# 清理一个自定义的 metric，注意只有在运行中的容器中可以这么做
clear_metric('precision')
```

### 和 Keras 结合

Keras 框架提供了 [Callback API](https://keras.io/callbacks/) 可以创建按照 batch 或者 epoch 级别的更新回调。利用这个方式，我们就可以把 `openbayestool` 中的自定义 metrics 添加到 keras 的训练过程中了。

```py
class OpenBayesMetricsCallback(tf.keras.callbacks.Callback):
    def on_batch_end(self, batch, logs=None):
        """Print Training Metrics"""
        if batch % 300 == 0:
          openbayestool.log_metric('acc', float(logs.get('acc')))
          openbayestool.log_metric('loss', float(logs.get('loss')))

model.fit(x_train, y_train,
          epochs=epochs,
          verbose=1,
          callbacks=[OpenBayesMetricsCallback()])
```

在 [这里](https://github.com/signcl/openbayes-mnist-example/blob/master/pytorch/train.py) 可以看到完整的代码示例。
