export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 || value >= 100 ? 0 : 1)} ${units[index]}`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const rounded = Math.round(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remaining = rounded % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`
}

export function formatRate(bitsPerSecond?: number): string {
  if (!bitsPerSecond) return '未知'
  return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`
}

export function codecLabel(codec?: string): string {
  const labels: Record<string, string> = {
    h264: 'H.264',
    hevc: 'H.265 / HEVC',
    vp9: 'VP9',
    av1: 'AV1',
    aac: 'AAC',
    opus: 'Opus',
    mp3: 'MP3'
  }
  return codec ? labels[codec] ?? codec.toUpperCase() : '无'
}
