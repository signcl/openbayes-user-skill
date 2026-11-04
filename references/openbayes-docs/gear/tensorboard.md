---
title: 使用 TensorBoard
category: gear
sidebar_position: 5
---

为了更方便 TensorFlow 程序的理解、调试与优化，TensorFlow 团队发布了一套名为 [TensorBoard](http://www.tensorfly.cn/tfdoc/how_tos/summaries_and_tensorboard.html) 的可视化工具。可以用 TensorBoard 来展现 TensorFlow 图，绘制图像生成的定量指标图以及显示附加数据（如其中传递的图像）。

目前 OpenBayes 容器在创建 Task 或 Jupyter 工作空间时都已经支持了 TensorBoard。

以下的代码示例展示了如果在训练时指定使用 TensorBoard：

```py
def create_model():
  model = tf.keras.models.Sequential([
  tf.keras.layers.Dense(512, activation=tf.nn.relu, input_shape=(img_rows * img_cols,)),
  tf.keras.layers.Dropout(0.2),
  tf.keras.layers.Dense(num_classes, activation=tf.nn.softmax)
])

  model.compile(optimizer='adam',
              loss='sparse_categorical_crossentropy',
              metrics=['accuracy'])

  return model

model = create_model()
model.summary()

log_path = './tf_dir'

# 设置 TensorBoard 路径到 tf_dir
tb_callback = tf.keras.callbacks.TensorBoard(log_dir=log_path)

model.fit(x_train, y_train,
          epochs=epochs,
          verbose=1,
          callbacks=[tb_callback])
```

完整的代码见 [MNist Example](https://github.com/signcl/openbayes-mnist-example)。

:::caution 注意
如下图所示，我们默认指定 TensorBoard 数据获取的目录为 `/openbayes/home` 下的 `tf_dir` 文件夹。因此如果您需要展示 TensorBoard 数据，请务必将 `TensorBoard` 的 `log_dir` 设置为该目录。
:::

![](/img/docs/gear-tensorboard-1.png)

对于运行成功的容器，其页面上会出现 "打开 TensorBoard" 的按钮，打开就可以看到正在运行的 TensorBoard 了。

![](/img/docs/15514372525492.jpg)


容器只有在运行的状态下才能查看 TensorBoard，如果您想在容器停止后依然查看 TensorBoard，请将 "工作目录" 下载到本地，并通过在本地安装 TensorBoard 来查看其中的内容：

```
tensorboard --logdir=<TensorBoard 数据目录>
```

然后在浏览器打开 [http://localhost:6006/](http://localhost:6006) 即可。
