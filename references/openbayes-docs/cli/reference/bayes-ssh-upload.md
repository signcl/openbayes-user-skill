---
title: bayes ssh upload
description: 上传 SSH 公钥
category: cli
---

### 描述

上传 SSH 公钥

```bash
bayes ssh upload [公钥] [选项]
```

### 可用选项

```bash
-h, --help          查看 upload 的帮助
-n, --name string   [可选] SSH 名字，不填则默认使用 hostname
```

### 使用用例

```bash
bayes ssh upload ~/.ssh/id_rsa.pub --name hostname
```

### 相关命令

* [bayes ssh create](/docs/cli/reference/bayes-ssh-create/) - 创建新的 SSH key
