export type PresetId = 'mp4-h264' | 'mp4-h265' | 'webm-vp9' | 'mp3-audio'

export interface MediaInfo {
  path: string
  fileName: string
  size: number
  duration: number
  format: string
  width?: number
  height?: number
  frameRate?: number
  videoCodec?: string
  audioCodec?: string
  bitRate?: number
  audioTracks: number
  subtitleTracks: number
  thumbnailDataUrl?: string
}

export interface ToolchainStatus {
  ready: boolean
  ffmpegPath?: string
  ffprobePath?: string
  version?: string
  error?: string
}

export interface ConversionRequest {
  jobId: string
  inputPath: string
  outputDirectory?: string
  presetId: PresetId
}

export interface ConversionResult {
  jobId: string
  outputPath: string
  media: MediaInfo
}

export interface ConversionProgress {
  jobId: string
  percent: number
  processedSeconds: number
  speed?: string
  outputPath?: string
  phase: 'starting' | 'converting' | 'validating'
}

export interface DesktopApi {
  chooseVideos: () => Promise<string[]>
  chooseOutputDirectory: () => Promise<string | undefined>
  inspectMedia: (filePath: string) => Promise<MediaInfo>
  getToolchainStatus: () => Promise<ToolchainStatus>
  startConversion: (request: ConversionRequest) => Promise<ConversionResult>
  cancelConversion: (jobId: string) => Promise<boolean>
  openPath: (path: string) => Promise<string>
  showItemInFolder: (path: string) => Promise<void>
  getPathForFile: (file: File) => string
  onConversionProgress: (listener: (progress: ConversionProgress) => void) => () => void
}
