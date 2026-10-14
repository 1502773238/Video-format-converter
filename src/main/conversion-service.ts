import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type {
  MediaInfo,
  ConversionProgress,
  ConversionRequest,
  ConversionResult
} from '../shared/contracts'
import { getPreset, type ConversionPreset } from '../shared/presets'
import { inspectMedia } from './media-service'
import { resolveToolchain } from './toolchain'
import { terminateProcessTree } from './utils/process-tree'
import { assertSafeJobId, validateOutputDirectory } from './validation'

interface ActiveConversion {
  child?: ChildProcessWithoutNullStreams
  temporaryPath?: string
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

export function validateConvertedMedia(source: MediaInfo, output: MediaInfo, preset: ConversionPreset): void {
  if (output.duration <= 0 || (source.duration > 0 && output.duration < source.duration * 0.9)) {
    throw new Error('输出文件校验失败：时长异常。')
  }
  if (preset.audioOnly) {
    if (output.videoCodec || output.audioCodec !== preset.expectedAudioCodec || output.audioTracks < 1) {
      throw new Error('输出文件校验失败：音频轨道或编码不符合预设。')
    }
    return
  }
  if (
    output.videoCodec !== preset.expectedVideoCodec ||
    !output.width ||
    !output.height ||
    output.width !== source.width ||
    output.height !== source.height
  ) {
    throw new Error('输出文件校验失败：视频轨道、编码或分辨率不符合预设。')
  }
  if (source.audioCodec && (output.audioCodec !== preset.expectedAudioCodec || output.audioTracks < 1)) {
    throw new Error('输出文件校验失败：音频轨道缺失或编码不符合预设。')
  }
  if (source.frameRate && output.frameRate) {
    const allowedDifference = Math.max(0.5, source.frameRate * 0.1)
    if (Math.abs(source.frameRate - output.frameRate) > allowedDifference) {
      throw new Error('输出文件校验失败：帧率异常。')
    }
  }
}

export class ConversionService {
  private readonly active = new Map<string, ActiveConversion>()
  private readonly completedOutputs = new Set<string>()

  constructor(private readonly window: BrowserWindow) {}

  async start(request: ConversionRequest): Promise<ConversionResult> {
    assertSafeJobId(request.jobId)
    if (this.active.size > 0) throw new Error('已有任务正在运行，请等待当前任务完成。')

    const state: ActiveConversion = { cancelled: false }
    this.active.set(request.jobId, state)

    let temporaryPath: string | undefined
    try {
      const preset = getPreset(request.presetId)
      const source = await inspectMedia(request.inputPath, false)
      this.throwIfCancelled(state)
      if (!preset.audioOnly && !source.videoCodec) {
        throw new Error('这个文件没有可转换的视频轨道。')
      }
      if (preset.audioOnly && !source.audioCodec) {
        throw new Error('这个文件没有可提取的音频轨道。')
      }

      const outputDirectory = request.outputDirectory
        ? await validateOutputDirectory(request.outputDirectory)
        : dirname(source.path)
      this.throwIfCancelled(state)
      const outputPath = await uniqueOutputPath(source.path, outputDirectory, preset.extension)
      temporaryPath = join(
        dirname(outputPath),
        `.${basename(outputPath, extname(outputPath))}.${request.jobId}.part${extname(outputPath)}`
      )
      state.temporaryPath = temporaryPath
      const { ffmpeg } = resolveToolchain()
      const args = [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-i',
        source.path,
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

      await this.runFfmpeg(request.jobId, state, ffmpeg, args, outputPath, source.duration)
      this.emit({
        jobId: request.jobId,
        percent: 99,
        processedSeconds: source.duration,
        outputPath,
        phase: 'validating'
      })
      const outputMedia = await inspectMedia(temporaryPath, false)
      validateConvertedMedia(source, outputMedia, preset)
      this.throwIfCancelled(state)

      await rename(temporaryPath, outputPath)
      this.completedOutputs.add(outputPath.toLocaleLowerCase())
      return { jobId: request.jobId, outputPath, media: { ...outputMedia, path: outputPath } }
    } catch (error) {
      if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    } finally {
      this.active.delete(request.jobId)
    }
  }

  cancel(jobId: string): boolean {
    const active = this.active.get(jobId)
    if (!active) return false
    active.cancelled = true
    if (active.child) void terminateProcessTree(active.child)
    return true
  }

  cancelAll(): void {
    for (const jobId of this.active.keys()) this.cancel(jobId)
  }

  canRevealOutput(filePath: string): boolean {
    return this.completedOutputs.has(filePath.toLocaleLowerCase())
  }

  private emit(progress: ConversionProgress): void {
    if (!this.window.isDestroyed()) this.window.webContents.send('conversion:progress', progress)
  }

  private runFfmpeg(
    jobId: string,
    state: ActiveConversion,
    executable: string,
    args: string[],
    outputPath: string,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (state.cancelled) {
        reject(new Error('任务已取消。'))
        return
      }
      const child = spawn(executable, args, { windowsHide: true })
      state.child = child
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

  private throwIfCancelled(state: ActiveConversion): void {
    if (state.cancelled) throw new Error('任务已取消。')
  }

}
