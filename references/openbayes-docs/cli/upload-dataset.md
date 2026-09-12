---
title: 用 bayes 上传数据
category: cli-idx
sidebar_position: 4
---

这里我们介绍如何使用 `bayes` 上传数据集的完整流程：
1. 创建一个新的数据集
2. 创建一个空的数据集版本
3. 上传数据到指定版本
4. 查看和管理数据集

下面我们将使用 tiny imagenet 数据集作为示例，逐步说明整个过程。

## 创建一个新的数据集

```
$ bayes data create tiny-imagenet -m "稍微说明一下这个 tiny-imagenet 数据集" -o

数据集 tiny-imagenet (tiQXU5Z5DIy) 创建成功
打开网页 https://openbayes.com/console/username/datasets/tiQXU5Z5DIy 可查看数据集 tiny-imagenet (tiQXU5Z5DIy) 的详细信息
正在跳转到浏览器...
已成功打开浏览器
```

介绍一下几个可用的参数：

-  `-m` 或 `--message` 数据集描述信息，可留空
-  `-o` 或 `--open` 将会在数据集创建成功后，在浏览器打开相应的 web 界面

同时你也可以在终端的打印信息中看到在数据集的 URL 和 ID。

## 创建一个空的数据集版本

在上传数据之前，需要先创建一个空的数据集版本。使用以下命令创建一个空的数据集版本：

```
$ bayes data new-version tiQXU5Z5DIy

当前正在个人账号 admin 上进行操作...
数据集 tiQXU5Z5DIy/1 创建成功
```

创建成功后，系统会返回新创建的版本号，这个版本号将在后续上传数据时使用。请记住这个版本号，因为在上传数据时需要通过 `--version` 或者 `-v` 参数指定。如果忘记了版本号，可以通过 `bayes data versions tiQXU5Z5DIy` 命令查看所有版本。

## 通过命令行直接上传文件夹

创建空的数据集版本后，你可以将数据上传到该版本。在上传命令中，需要指定 `--version` 或者 `-v` 参数为前一步创建的版本号：

```
$ bayes data upload tiQXU5Z5DIy -v 1 -p '/Users/username/test-upload' -o
当前正在个人账号 admin 上进行操作...
当前工作目录 /Users/username/test-upload
正在准备上传数据集 tiQXU5Z5DIy...
正在获取上传授权...
开始上传文件，请耐心等待...
共发现 3 个文件
正在分析文件列表...
剔除在 .openbayesignore 中忽略的文件及文件夹...
共有文件 2 个需要上传，忽略了 2 个文件

被忽略的文件列表:
  - .DS_Store
  - .openbayesignore
78949397fb964f6293f9c71b0488e2d9.jpeg: 100%|███████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████| 117k/117k [00:00<00:00, 122kB/s]
↑ 已上传: /Users/username/test-upload/78949397fb964f6293f9c71b0488e2d9.jpeg
开始新的分块上传: 测试视频.mov
创建新的上传ID: f436061f-305d-43c3-b32d-5d9557ada5cb
测试视频.mov: 100%|█████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████| 37.3M/37.3M [00:11<00:00, 3.18MB/s]
↑ 已上传: /Users/username/test-upload/测试视频.mov

✅ 上传成功! 已上传 2 个文件，跳过 0 个已存在文件
数据集 tiQXU5Z5DIy 的版本 v1 已更新
正在打开数据集 https://openbayes.com/console/admin/datasets/tiQXU5Z5DIy
正在跳转到浏览器...
已成功打开浏览器.
```

命令行上传支持断点续传，如果在上传过程中因为意外请求中断了，再次输入上传命令可以自动恢复未完成的上传任务：

```
$ bayes data upload tiQXU5Z5DIy -v 1 -p '/Users/username/test-upload' -o
当前正在个人账号 admin 上进行操作...
当前工作目录 /Users/username/test-upload
正在准备上传数据集 tiQXU5Z5DIy...
正在获取上传授权...
开始上传文件，请耐心等待...
共发现 4 个文件
正在分析文件列表...
剔除在 .openbayesignore 中忽略的文件及文件夹...
共有文件 2 个需要上传，忽略了 2 个文件

被忽略的文件列表:
  - .DS_Store
  - .openbayesignore
↷ 跳过: /Users/username/test-upload/78949397fb964f6293f9c71b0488e2d9.jpeg (已存在)
找到未完成的上传任务，正在恢复: 测试视频.mov
恢复上传ID: 8a005a27-5639-45ff-af1b-ec9444d62c63
已上传 2 个分块，共 8 个分块
测试视频.mov: 100%|█████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████| 37.3M/37.3M [00:05<00:00, 4.60MB/s]
↑ 已上传: /Users/username/test-upload/测试视频.mov

✅ 上传成功! 已上传 1 个文件，跳过 1 个已存在文件
数据集 tiQXU5Z5DIy 的版本 v1 已更新
正在打开数据集 https://openbayes.com/console/admin/datasets/tiQXU5Z5DIy
正在跳转到浏览器...
已成功打开浏览器.
```

介绍一下几个可用的参数：

-  `-v` 或 `--version` 需要上传的数据集版本号，必填
-  `-p` 或 `--path` 数据集文件或文件夹的本地路径，不填则使用当前目录
-  `-d` 或 `--directory` 数据集文件上传的指定路径，不填则默认使用根目录
-  `-o` 或 `--open` 将会在数据集上传完成后，在浏览器打开相应的 web 界面

稍等服务器端数据同步可以看到数据集已经上传好了：

![](/img/docs/bayes-upload-dataset-1.png)

:::note
如果你已经有一个现成的压缩包需要上传到 OpenBayes，你可以通过命令 `bayes data upload tiQXU5Z5DIy -v 1 -p '/Users/username/test/测试.zip'`  直接上传。
:::

:::note
如果你只有一个单一文件需要上传到 OpenBayes，你同样可以通过命令 `bayes data upload tiQXU5Z5DIy -v 1 -p '/Users/username/test/test.txt'` 上传到 OpenBayes。
:::

## 通过命令行打开数据集 web 界面

通过以下命令我们可以直接从命令行打开 web 界面：

```
$ bayes data open tiQXU5Z5DIy

当前正在个人账号 admin 上进行操作...
正在打开数据集 https://openbayes.com/console/username/datasets/tiQXU5Z5DIy
正在跳转到浏览器...
已成功打开浏览器.
```

或者，在上传命令最后加入 -o 参数，命令行工具将会在上传完成后立即打开相应的 web 界面：

```
$ bayes data upload tiQXU5Z5DIy -v 1 -p '/Users/username/test-upload' -o

当前正在个人账号 admin 上进行操作...
当前工作目录 /Users/username/test-upload
正在准备上传数据集 tiQXU5Z5DIy...
正在获取上传授权...
开始上传文件，请耐心等待...
共发现 3 个文件
正在分析文件列表...
剔除在 .openbayesignore 中忽略的文件及文件夹...
共有文件 2 个需要上传，忽略了 2 个文件

被忽略的文件列表:
  - .DS_Store
  - .openbayesignore
78949397fb964f6293f9c71b0488e2d9.jpeg: 100%|███████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████| 117k/117k [00:00<00:00, 122kB/s]
↑ 已上传: /Users/username/test-upload/78949397fb964f6293f9c71b0488e2d9.jpeg
开始新的分块上传: 测试视频.mov
创建新的上传ID: f436061f-305d-43c3-b32d-5d9557ada5cb
测试视频.mov: 100%|█████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████████| 37.3M/37.3M [00:11<00:00, 3.18MB/s]
↑ 已上传: /Users/username/test-upload/测试视频.mov

✅ 上传成功! 已上传 2 个文件，跳过 0 个已存在文件
数据集 tiQXU5Z5DIy 的版本 v1 已更新
正在打开数据集 https://openbayes.com/console/admin/datasets/tiQXU5Z5DIy
正在跳转到浏览器...
已成功打开浏览器.
```
