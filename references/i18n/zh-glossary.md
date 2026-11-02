# 中文术语表（zh-glossary）

用于将中文用户表达稳定映射到 OpenBayes 产品语义与 GraphQL 意图。

## 核心术语

- 容器 -> Job（用户对 Job 的通俗称呼，默认创建 Workspace 类型）
- 部署 -> deploy（可能指 workspace 启动，也可能指 serving 发布）
- 工作空间 -> workspace（`Job(mode=WORKSPACE)`，平台推荐的 Job 类型）
- 任务 -> task（`Job(mode=TASK)`）
- 虚拟机 -> virtual machine（`Job(mode=VIRTUAL_MACHINE)`）
- 重启工作空间 -> restart workspace（`job.restart.workspace`）
- 停止任务/停机 -> stop job（`job.stop`）
- 查看任务 -> inspect job（`job.read`）
- 创建项目 -> create project（`project.create`）

## 资源与运行时

- 算力 -> compute resource（`resource`）
- 镜像 -> runtime image（`runtime`）
- 资源满载 -> full load（`isFullLoad=true`）
- 可负担/可用 -> affordable（`affordable=true`）
- 配额 -> quota（展示信息，不等于资源可用性唯一判定）
- 并发限制 -> parallel limit（`limitations.resources[*].freeCount`）

## 数据绑定与存储

- 绑定数据集 -> bind dataset（`dataBindings`）
- 只读绑定 -> read-only binding（`bindingAuth=READ_ONLY`）
- 可写绑定 -> read-write binding（`bindingAuth=READ_WRITE`）
- 挂载路径 -> mount path（`mountPath`）
- 数据集版本 -> dataset version（`datasetVersion`）
- 可挂载 -> mountable as a dataBinding（`isDeleted=false` + 有读权限；可写额外要 `canBeBoundWithWritePermission`）
- 可一键部署 -> bindable as serving job（`canBindJob=true`，仅 MODEL）
- 输出目录 -> job output binding（例如 `/openbayes/home`）

## 访问与远程操作

- SSH 入口 -> ssh link（`job.links` 中 `name=ssh`）
- notebook 入口（历史兼容字段） -> notebook link（`job.links` 中 `name=notebook`，现网仍可能返回，勿丢弃）
- 前端控制台入口 -> frontend link（`job.links` 中 `name=frontend`）
- SSH 密码 -> job password（`job.password`，敏感字段）
- 后台会话 -> tmux session（长任务推荐）

## 常见中文表达归一

- "创建容器" / "开个容器" / "帮我开台机器" -> 创建 Job，默认使用 Workspace 类型
- "帮我部署一下模型" -> 先澄清：workspace 启动还是 serving 发布
- "把这个容器开起来" -> 通常归一为 workspace 重启或启动
- "把模型挂上去" -> 通常归一为新增或调整 dataset binding
- "这个任务跑不起来" -> 先做 `job.read` 再判断 stop/restart/update
- "给我 SSH 连进去" -> 先返回 `links.ssh`，失败时可用 `password` 回退认证

## 处理原则

- 先做语义归一，再执行 GraphQL。
- 写操作前先确认影响范围（资源、绑定、端口、目标 job）。
- 涉及敏感字段（如 `password`）默认不主动展示，除非用户明确要求。
