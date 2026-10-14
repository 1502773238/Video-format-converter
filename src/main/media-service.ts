import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { MediaInfo } from '../shared/contracts'
import { resolveToolchain } from './toolchain'
import { runCommand } from './utils/run-command'

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
}

interface ProbeDocument {
  streams?: ProbeStream[]
  format?: {
    format_long_name?: string
    format_name?: string
    duration?: string
    bit_rate?: string
  }
}

function parseFraction(value?: string): number | undefined {
  if (!value) return undefined
  const [numerator, denominator = 1] = value.split('/').map(Number)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return undefined
  return numerator / denominator
}

function finiteNumber(value?: string): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function readProbe(filePath: string): Promise<ProbeDocument> {
  const { ffprobe } = resolveToolchain()
  const result = await runCommand(
    ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-show_chapters', filePath],
    { timeoutMs: 30_000, maxOutputBytes: 8 * 1024 * 1024 }
  )

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'ffprobe 无法读取这个文件。')
  }

  try {
    return JSON.parse(result.stdout) as ProbeDocument
  } catch {
    throw new Error('ffprobe 返回了无法解析的媒体信息。')
  }
}

async function createThumbnail(filePath: string, duration: number): Promise<string | undefined> {
  const { ffmpeg } = resolveToolchain()
  const timestamp = duration <= 2 ? 0 : Math.min(10, Math.max(1, duration * 0.1))
  const result = await runCommand(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      timestamp.toFixed(3),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      'scale=640:-2',
      '-q:v',
      '3',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1'
    ],
    { timeoutMs: 30_000, maxOutputBytes: 12 * 1024 * 1024, stdoutEncoding: 'latin1' }
  )

  if (result.exitCode !== 0 || !result.stdout) return undefined
  return `data:image/jpeg;base64,${Buffer.from(result.stdout, 'latin1').toString('base64')}`
}

export async function inspectMedia(filePath: string, includeThumbnail = true): Promise<MediaInfo> {
  const [document, fileStat] = await Promise.all([readProbe(filePath), stat(filePath)])
  const streams = document.streams ?? []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  const duration = finiteNumber(document.format?.duration) ?? 0
  const info: MediaInfo = {
    path: filePath,
    fileName: basename(filePath),
    size: fileStat.size,
    duration,
    format: document.format?.format_long_name ?? document.format?.format_name ?? '未知格式',
    width: video?.width,
    height: video?.height,
    frameRate: parseFraction(video?.avg_frame_rate) ?? parseFraction(video?.r_frame_rate),
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    bitRate: finiteNumber(document.format?.bit_rate),
    audioTracks: streams.filter((stream) => stream.codec_type === 'audio').length,
    subtitleTracks: streams.filter((stream) => stream.codec_type === 'subtitle').length
  }

  if (includeThumbnail && video) {
    info.thumbnailDataUrl = await createThumbnail(filePath, duration)
  }

  return info
}
