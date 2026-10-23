---
title: 公共资源概览
description: 提供了一些常见的公开数据集、预训练模型以及公开的教程
category: open-resources
sidebar_position: 0
---

OpenBayes 提供了三种类型的公共资源：

1. 公共数据集
2. 公共教程
3. 公共模型

## 公共数据集

机器学习模型的训练通常需要使用大量的标注数据，目前市面上有大量的公共数据集（如 [PASCAL_VOC](http://host.robots.ox.ac.uk/pascal/VOC/)）方便机器学习从业者直接拿来使用。这些数据集有些规模比较巨大，为了方便用户直接在 OpenBayes 平台直接使用（而不是自己去下载后上传），OpenBayes 会周期性将这种通用的数据集通过「公共数据集」的形式提供给 OpenBayes 的用户。

:::note
当您把公共数据集中的数据以只读的方式绑定到容器中后，其数据集所用的空间不会占用个人相应的存储空间
:::

![](/img/docs/open-resources-index-1.png)

在「创建新容器」时，可以将公共数据集绑定到容器中：

![](/img/docs/open-resources-index-2.png)

## 公共教程

公共教程主要是市面上的一些教程，方便用户熟悉 OpenBayes 的使用，通过「克隆」可以直接将教程运行起来，方便用户对相应内容的学习。

![](/img/docs/open-resources-index-3.png)
![](/img/docs/open-resources-index-4.png)

## 公共模型

和公共数据集类似，市面上有大量的预训练模型可以用于 [迁移学习](https://machinelearningmastery.com/transfer-learning-for-deep-learning/) ，这些预训练模型通常是通过大规模的数据集以及大量的算力训练得到的。同样的，这些预训练模型也可以在创建新容器的时候绑定到容器中使用。

![](/img/docs/open-resources-index-5.png)

## 权限

公开资源不支持批量下载，用户则必须通过 [数据绑定](/docs/gear/databinding) 后访问该内容。
