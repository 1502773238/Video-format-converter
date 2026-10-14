# FrameFlow

FrameFlow 是一款面向普通用户的 Windows 桌面视频格式转换器。它用用途预设代替复杂参数，所有媒体分析、缩略图生成和转码都在本机通过 FFmpeg 完成。

> 当前状态：MVP 开发中。核心媒体链路和浏览器级界面验收已经通过，Windows Electron 冷启动与安装包验收仍在进行。

![FrameFlow 工作区](outputs/frameflow-workspace.png)

## 已实现

- 拖放或文件选择导入多个视频
- 使用 ffprobe 读取时长、分辨率、帧率、编码、码率和轨道信息
- 使用 FFmpeg 在视频约 10% 位置生成缩略图
- 通用 MP4、H.265 MP4、WebM 和 MP3 提取四种用途预设
- 顺序任务队列、实时进度、速度显示和单任务取消
- 输出文件自动避让同名文件，不静默覆盖原文件
- 临时文件转码、完成后 ffprobe 校验、校验通过后原子改名
- 转换完成后打开文件位置
- 960 × 640 最小窗口布局

## 技术栈

- Electron + React + TypeScript + Vite
- Zustand
- FFmpeg / ffprobe 命令行
- Vitest + Playwright
- electron-builder

## 本地运行

需要 Node.js 20+、pnpm 11+。首次安装会下载 Electron、FFmpeg 和 ffprobe，网络较慢时可能需要等待。

```powershell
pnpm install
pnpm dev
```

只预览和验收界面：

```powershell
pnpm dev:renderer
```

## 验证

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:media
```

`test:media` 会生成带中文文件名的短视频，依次验证探测、缩略图、WebM 转换和输出校验。

## Windows 打包

```powershell
pnpm package:win
```

打包前脚本会把 FFmpeg 和 ffprobe 固定复制到 `resources/bin`，避免包管理器软链接布局影响资源收集。正式发布前还需完成 FFmpeg 构建及编解码器许可证核对。

## 架构与决策

- [架构说明](docs/ARCHITECTURE.md)
- [开发决策记录](docs/DECISIONS.md)
- [使用与验收手册](docs/ACCEPTANCE.md)
- [方案设计与技术选型](outputs/视频格式转换器方案设计与技术选型.md)

## 许可证

应用源码计划采用 MIT License。FFmpeg、ffprobe 及其编解码器遵循各自许可证，发布包需单独保留第三方许可证说明。
