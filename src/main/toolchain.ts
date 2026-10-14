import { app } from 'electron'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { ToolchainStatus } from '../shared/contracts'
import { runCommand } from './utils/run-command'

export interface ToolchainPaths {
  ffmpeg: string
  ffprobe: string
}

export function resolveToolchain(): ToolchainPaths {
  if (app.isPackaged) {
    return {
      ffmpeg: join(process.resourcesPath, 'bin', 'ffmpeg.exe'),
      ffprobe: join(process.resourcesPath, 'bin', 'ffprobe.exe')
    }
  }

  const require = createRequire(import.meta.url)
  const ffmpegStatic = require('ffmpeg-static') as string | null
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe') as { path?: string }
  if (!ffmpegStatic || !ffprobeInstaller.path) {
    throw new Error('开发环境中的 FFmpeg 或 ffprobe 路径不可用。')
  }

  return { ffmpeg: ffmpegStatic, ffprobe: ffprobeInstaller.path }
}

export async function getToolchainStatus(): Promise<ToolchainStatus> {
  try {
    const paths = resolveToolchain()
    if (!existsSync(paths.ffmpeg) || !existsSync(paths.ffprobe)) {
      return { ready: false, error: '找不到 FFmpeg 工具，请重新安装或检查应用资源。' }
    }

    const result = await runCommand(paths.ffmpeg, ['-version'], { timeoutMs: 10_000 })
    return {
      ready: result.exitCode === 0,
      ffmpegPath: paths.ffmpeg,
      ffprobePath: paths.ffprobe,
      version: result.stdout.split(/\r?\n/, 1)[0],
      error: result.exitCode === 0 ? undefined : result.stderr
    }
  } catch (error) {
    return { ready: false, error: error instanceof Error ? error.message : String(error) }
  }
}
