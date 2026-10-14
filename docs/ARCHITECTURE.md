# FrameFlow 架构说明

## 目标

架构首先服务于三个产品目标：普通用户看得懂、长时间转换可控、媒体文件始终可恢复。实现遵循单一职责、显式边界、最小权限、失败可见和可测试原则。

## 进程边界

```text
React Renderer
  │  typed window.frameFlow API
  ▼
Preload（白名单 IPC）
  │
  ▼
Electron Main
  ├─ MediaService ───── ffprobe / FFmpeg thumbnail
  ├─ ConversionService ─ FFmpeg progress / cancel / verify
  └─ Toolchain ───────── executable resolution / health check
```

- Renderer 只负责交互与状态展示，不具有 Node.js 或任意命令执行能力。
- Preload 只暴露 `DesktopApi` 中定义的白名单方法。
- Main 负责文件对话框、路径处理、子进程和系统能力。
- FFmpeg 通过参数数组启动，不经过 shell 拼接用户输入。

Electron 窗口启用 `contextIsolation` 和 `sandbox`，关闭 `nodeIntegration`。外部链接只允许 HTTPS。

## 核心模块

### 媒体读取

`MediaService` 用 ffprobe JSON 一次性读取媒体元数据，再调用 FFmpeg 截取缩略图。缩略图时间点取视频时长的约 10%，并限制在 1 到 10 秒，减少黑屏首帧概率。

### 转换任务

`ConversionService` 的单任务状态流为：

```text
ready → starting → converting → validating → completed
                    └──────────────→ cancelled / error
```

输出先写入同目录隐藏临时文件。FFmpeg 成功后使用 ffprobe 检查输出时长，再改名为最终文件。失败或取消时删除临时文件。若目标名称已存在，自动添加递增序号，不覆盖原文件。

### 界面状态

Zustand 保存任务队列、当前选中任务及每个任务独立的预设。界面只消费结构化状态，不解析 FFmpeg 日志。高级参数是只读说明，避免用户误填导致不可预测命令。

## 代码原则

- TypeScript 严格模式，跨进程对象必须有共享类型。
- 业务服务不依赖 React；界面不直接访问文件系统。
- 路径和参数始终作为独立值传递，不拼接 shell 字符串。
- 所有长任务均提供进度、取消和明确终态。
- 不静默覆盖，不把未校验的临时输出冒充成功结果。
- 用户错误显示可行动的中文信息；完整技术信息保留在服务层。
- 单元测试覆盖纯函数，真实 FFmpeg 冒烟测试覆盖关键媒体链路，Playwright 覆盖用户可见流程。

## 当前约束

- MVP 按顺序执行任务，避免多路转码争抢 CPU；后续可提供并发数设置。
- 首版仅面向 Windows x64。
- 首版预设固定，尚不提供自定义编码参数编辑器。
