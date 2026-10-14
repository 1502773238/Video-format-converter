import type {
  ConversionProgress,
  ConversionResult,
  DesktopApi,
  MediaInfo
} from '../../shared/contracts'

const thumbnail = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#1b5462"/><stop offset=".55" stop-color="#162b3d"/><stop offset="1" stop-color="#0b111a"/>
      </linearGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
        <stop stop-color="#ffe6aa"/><stop offset="1" stop-color="#ef9a78"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#sky)"/>
    <circle cx="470" cy="105" r="44" fill="url(#sun)" opacity=".95"/>
    <path d="M0 278L145 152l74 77 85-104 128 153 82-98 126 104v76H0z" fill="#162a31"/>
    <path d="M0 302l122-79 94 73 83-86 89 81 92-56 160 83v42H0z" fill="#0c1b21"/>
    <path d="M0 315c110-32 209-10 310-23 101-13 198-7 330 27v41H0z" fill="#5f9f89" opacity=".46"/>
  </svg>
`)}`

const demoMedia: MediaInfo = {
  path: 'D:\\Videos\\秋日山谷-航拍素材.mov',
  fileName: '秋日山谷-航拍素材.mov',
  size: 486_539_264,
  duration: 134,
  format: 'QuickTime / MOV',
  width: 3840,
  height: 2160,
  frameRate: 59.94,
  videoCodec: 'hevc',
  audioCodec: 'aac',
  bitRate: 29_400_000,
  audioTracks: 1,
  subtitleTracks: 0,
  thumbnailDataUrl: thumbnail
}

export function createMockDesktopApi(): DesktopApi {
  const progressListeners = new Set<(progress: ConversionProgress) => void>()
  const cancelledJobs = new Set<string>()

  return {
    chooseVideos: async () => ['D:\\Videos\\秋日山谷-航拍素材.mov', 'D:\\Videos\\产品介绍（终版）.mkv'],
    chooseOutputDirectory: async () => 'D:\\Videos\\FrameFlow 输出',
    inspectMedia: async (filePath) => {
      await new Promise((resolve) => setTimeout(resolve, 260))
      return {
        ...demoMedia,
        path: filePath,
        fileName: filePath.split(/[\\/]/).at(-1) ?? filePath,
        size: filePath.includes('产品') ? 128_700_000 : demoMedia.size,
        width: filePath.includes('产品') ? 1920 : demoMedia.width,
        height: filePath.includes('产品') ? 1080 : demoMedia.height
      }
    },
    getToolchainStatus: async () => ({ ready: true, version: 'ffmpeg mock for renderer QA' }),
    startConversion: async (request): Promise<ConversionResult> => {
      cancelledJobs.delete(request.jobId)
      for (const percent of [4, 18, 37, 62, 81, 98]) {
        await new Promise((resolve) => setTimeout(resolve, 160))
        if (cancelledJobs.has(request.jobId)) throw new Error('转换已取消')
        progressListeners.forEach((listener) => listener({
          jobId: request.jobId,
          percent,
          processedSeconds: demoMedia.duration * percent / 100,
          speed: '1.8x',
          outputPath: 'D:\\Videos\\FrameFlow 输出\\秋日山谷-航拍素材-converted.mp4',
          phase: 'converting'
        }))
      }
      progressListeners.forEach((listener) => listener({
        jobId: request.jobId,
        percent: 99,
        processedSeconds: demoMedia.duration,
        phase: 'validating'
      }))
      await new Promise((resolve) => setTimeout(resolve, 200))
      return {
        jobId: request.jobId,
        outputPath: 'D:\\Videos\\FrameFlow 输出\\秋日山谷-航拍素材-converted.mp4',
        media: demoMedia
      }
    },
    cancelConversion: async (jobId) => {
      cancelledJobs.add(jobId)
      return true
    },
    showItemInFolder: async () => undefined,
    getPathForFile: (file) => file.name,
    onConversionProgress: (listener) => {
      progressListeners.add(listener)
      return () => progressListeners.delete(listener)
    }
  }
}
