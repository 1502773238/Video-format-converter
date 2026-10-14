import type { PresetId } from './contracts'

export interface ConversionPreset {
  id: PresetId
  label: string
  shortLabel: string
  description: string
  extension: string
  badge: string
  args: readonly string[]
}

export const conversionPresets: readonly ConversionPreset[] = [
  {
    id: 'mp4-h264',
    label: '通用 MP4',
    shortLabel: '兼容性优先',
    description: '适合手机、电脑、电视和社交平台',
    extension: 'mp4',
    badge: '推荐',
    args: ['-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart']
  },
  {
    id: 'mp4-h265',
    label: '高压缩 MP4',
    shortLabel: '更小体积',
    description: '使用 H.265，节省空间但兼容性略低',
    extension: 'mp4',
    badge: '省空间',
    args: ['-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx265', '-preset', 'medium', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']
  },
  {
    id: 'webm-vp9',
    label: '网页 WebM',
    shortLabel: '网页使用',
    description: 'VP9 + Opus，适合网页和开放格式场景',
    extension: 'webm',
    badge: 'Web',
    args: ['-map', '0:v:0', '-map', '0:a?', '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus', '-b:a', '128k']
  },
  {
    id: 'mp3-audio',
    label: '提取 MP3 音频',
    shortLabel: '仅保留声音',
    description: '从视频中提取高质量 MP3 音频',
    extension: 'mp3',
    badge: '音频',
    args: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2']
  }
]

export function getPreset(id: PresetId): ConversionPreset {
  const preset = conversionPresets.find((candidate) => candidate.id === id)
  if (!preset) throw new Error(`未知的转换预设：${id}`)
  return preset
}
