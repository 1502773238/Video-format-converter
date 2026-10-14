import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type {
  ConversionProgress,
  ConversionRequest,
  ConversionResult
} from '../shared/contracts'
import { getPreset } from '../shared/presets'
import { inspectMedia } from './media-service'
import { resolveToolchain } from './toolchain'

interface ActiveConversion {
  child: ChildProcessWithoutNullStreams
  temporaryPath: string
  cancelled: boolean
}

function parseProgressTime(value: string): number {
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(value)
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function uniqueOutputPath(
  inputPath: string,
  outputDirectory: string | undefined,
  extension: string
): Promise<string> {
  const directory = outputDirectory || dirname(inputPath)
  const sourceName = basename(inputPath, extname(inputPath))
  let candidate = join(directory, `${sourceName}-converted.${extension}`)
  let suffix = 2

  while (await pathExists(candidate)) {
    candidate = join(directory, `${sourceName}-converted-${suffix}.${extension}`)
    suffix += 1
  }
  return candidate
}

export class ConversionService {
  private readonly active = new Map<string, ActiveConversion>()

  constructor(private readonly window: BrowserWindow) {}

  async start(request: ConversionRequest): Promise<ConversionResult> {
    if (this.active.has(request.jobId)) throw new Error('该任务已经在运行。')

    const preset = getPreset(request.presetId)
    const source = await inspectMedia(request.inputPath, false)
    if (request.presetId !== 'mp3-audio' && !source.videoCodec) {
      throw new Error('这个文件没有可转换的视频轨道。')
    }
    if (request.presetId === 'mp3-audio' && !source.audioCodec) {
      throw new Error('这个文件没有可提取的音频轨道。')
    }

    const outputPath = await uniqueOutputPath(request.inputPath, request.outputDirectory, preset.extension)
    const temporaryPath = join(
      dirname(outputPath),
      `.${basename(outputPath, extname(outputPath))}.${request.jobId}.part${extname(outputPath)}`
    )
    const { ffmpeg } = resolveToolchain()
    const args = [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      request.inputPath,
      ...preset.args,
      '-progress',
      'pipe:1',
      '-nostats',
      temporaryPath
    ]

    this.emit({
      jobId: request.jobId,
      percent: 0,
      processedSeconds: 0,
      outputPath,
      phase: 'starting'
    })

    try {
      await this.runFfmpeg(request.jobId, ffmpeg, args, temporaryPath, outputPath, source.duration)
      this.emit({
        jobId: request.jobId,
        percent: 99,
        processedSeconds: source.duration,
        outputPath,
        phase: 'validating'
      })
      const outputMedia = await inspectMedia(temporaryPath, false)
      if (outputMedia.duration <= 0 || (source.duration > 0 && outputMedia.duration < source.duration * 0.9)) {
        throw new Error('输出文件校验失败：视频时长异常。')
      }

      await rename(temporaryPath, outputPath)
      return { jobId: request.jobId, outputPath, media: { ...outputMedia, path: outputPath } }
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    } finally {
      this.active.delete(request.jobId)
    }
  }

  cancel(jobId: string): boolean {
    const active = this.active.get(jobId)
    if (!active) return false
    active.cancelled = true
    active.child.kill()
    return true
  }

  cancelAll(): void {
    for (const jobId of this.active.keys()) this.cancel(jobId)
  }

  private emit(progress: ConversionProgress): void {
    if (!this.window.isDestroyed()) this.window.webContents.send('conversion:progress', progress)
  }

  private runFfmpeg(
    jobId: string,
    executable: string,
    args: string[],
    temporaryPath: string,
    outputPath: string,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { windowsHide: true })
      const state: ActiveConversion = { child, temporaryPath, cancelled: false }
      this.active.set(jobId, state)
      let stdoutBuffer = ''
      let stderr = ''
      let processedSeconds = 0
      let speed: string | undefined

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8')
        const lines = stdoutBuffer.split(/\r?\n/)
        stdoutBuffer = lines.pop() ?? ''

        for (const line of lines) {
          const separator = line.indexOf('=')
          if (separator < 0) continue
          const key = line.slice(0, separator)
          const value = line.slice(separator + 1)
          if (key === 'out_time') processedSeconds = parseProgressTime(value)
          if (key === 'speed') speed = value
          if (key === 'progress') {
            const rawPercent = duration > 0 ? (processedSeconds / duration) * 100 : 0
            this.emit({
              jobId,
              percent: Math.min(98, Math.max(0, rawPercent)),
              processedSeconds,
              speed,
              outputPath,
              phase: 'converting'
            })
          }
        }
      })

      child.stderr.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString('utf8')}`.slice(-64_000)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (state.cancelled) {
          reject(new Error('任务已取消。'))
        } else if (code === 0) {
          resolve()
        } else {
          const lastLine = stderr.trim().split(/\r?\n/).at(-1)
          reject(new Error(lastLine || `FFmpeg 转换失败，退出码 ${code ?? '未知'}。`))
        }
      })
    })
  }
}
