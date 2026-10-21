---
title: 容器间通讯
category: gear
sidebar_position: 11
---

如果需要两个运行中的容器之间传递数据，最方便的方法是通过 `ssh / scp` 或者 `rsync`。

## 获取目标容器 IP

首先登录**目标容器**（你想要连接的容器），打开 Terminal 执行如下内容查看容器 IP：

```bash
ip a
```

如果提示 `ip` 命令不存在，需要先安装：

```bash
apt install iproute2 -y
ip a
```

可以得到如下结果：

```txt
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
2: tunl0@NONE: <NOARP> mtu 1480 qdisc noop state DOWN group default qlen 1000
    link/ipip 0.0.0.0 brd 0.0.0.0
4: eth0@if96: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1440 qdisc noqueue state UP group default
    link/ether 2a:d7:3a:68:13:ee brd ff:ff:ff:ff:ff:ff link-netnsid 0
    inet 10.38.6.87/32 scope global eth0
       valid_lft forever preferred_lft forever
```

在输出结果中找到 `eth0` 对应的 IP 地址，这里是 `10.38.6.87`。

## 从其他容器连接

然后在**另一个容器**（发起连接的容器）中，通过以下命令连接到目标容器：

:::info
同一个创建人的容器之间已经准备好了密钥，不需要密码或者 `-i` 参数，可以直接连接。
:::

```bash
ssh 10.38.6.87
```

连接成功后，你就可以在容器之间传输文件了：

```bash
# 从当前容器复制文件到目标容器
scp /path/to/local/file 10.38.6.87:/path/to/remote/

# 从目标容器复制文件到当前容器
scp 10.38.6.87:/path/to/remote/file /path/to/local/

# 使用 rsync 同步目录
rsync -avz /path/to/local/dir/ 10.38.6.87:/path/to/remote/dir/
```
