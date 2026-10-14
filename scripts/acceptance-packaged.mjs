import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const projectRoot = resolve('.')
const executablePath = resolve('release', 'win-unpacked', 'FrameFlow.exe')
const ffprobePath = resolve('release', 'win-unpacked', 'resources', 'bin', 'ffprobe.exe')
const sourcePath = resolve('work', 'media-smoke', 'source-测试视频.mp4')
const outputDirectory = resolve('work', 'packaged-smoke-output')
const initialScreenshot = resolve('outputs', 'FrameFlow-正式版-初始界面.png')
const completedScreenshot = resolve('outputs', 'FrameFlow-正式版-转换完成.png')

for (const requiredPath of [executablePath, ffprobePath, sourcePath]) {
  if (!existsSync(requiredPath)) throw new Error(`验收所需文件不存在：${requiredPath}`)
}
mkdirSync(outputDirectory, { recursive: true })

const presetCases = [
  { label: '通用 MP4', extension: '.mp4', videoCodec: 'h264' },
  { label: '高压缩 MP4', extension: '.mp4', videoCodec: 'hevc' },
  { label: '网页 WebM', extension: '.webm', videoCodec: 'vp9' },
  { label: '提取 MP3 音频', extension: '.mp3', audioCodec: 'mp3' }
]

function inspectOutput(path) {
  const result = spawnSync(
    ffprobePath,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
    { encoding: 'utf8', windowsHide: true }
  )
  if (result.status !== 0) throw new Error(`成品 ffprobe 校验失败：${result.stderr}`)
  return JSON.parse(result.stdout)
}

const app = await electron.launch({ executablePath, cwd: projectRoot })
try {
  await app.evaluate(({ dialog, shell }, fixture) => {
    globalThis.__frameFlowVideoDialogCalls = 0
    globalThis.__frameFlowShownItem = undefined
    dialog.showOpenDialog = async (_window, options) => {
      if (options.properties?.includes('openDirectory')) {
        return { canceled: false, filePaths: [fixture.outputDirectory] }
      }
      globalThis.__frameFlowVideoDialogCalls += 1
      if (globalThis.__frameFlowVideoDialogCalls === 1) {
        return { canceled: true, filePaths: [] }
      }
      return { canceled: false, filePaths: [fixture.sourcePath] }
    }
    shell.showItemInFolder = (path) => {
      globalThis.__frameFlowShownItem = path
    }
  }, { sourcePath, outputDirectory })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('FFmpeg 已就绪').waitFor({ timeout: 30_000 })

  const toolchain = await page.evaluate(() => window.frameFlow.getToolchainStatus())
  if (!toolchain.ready || !toolchain.ffmpegPath?.includes('resources\\bin\\ffmpeg.exe')) {
    throw new Error(`正式版 FFmpeg 路径异常：${JSON.stringify(toolchain)}`)
  }

  const initialMetrics = await page.evaluate(() => {
    const bounds = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect()
      return rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left } : undefined
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      },
      topbar: bounds('.topbar'),
      stage: bounds('.empty-stage'),
      actionBar: bounds('.action-bar')
    }
  })
  if (initialMetrics.document.width > initialMetrics.viewport.width || initialMetrics.document.height > initialMetrics.viewport.height) {
    throw new Error(`初始界面出现非预期页面滚动：${JSON.stringify(initialMetrics)}`)
  }
  const layoutTolerance = 1
  for (const region of [initialMetrics.topbar, initialMetrics.stage, initialMetrics.actionBar]) {
    if (
      !region ||
      region.left < -layoutTolerance ||
      region.top < -layoutTolerance ||
      region.right > initialMetrics.viewport.width + layoutTolerance ||
      region.bottom > initialMetrics.viewport.height + layoutTolerance
    ) {
      throw new Error(`初始界面区域发生裁切：${JSON.stringify(initialMetrics)}`)
    }
  }
  await page.screenshot({ path: initialScreenshot })

  const dropZone = page.getByRole('button', { name: /把视频拖到这里/ })
  await dropZone.click()
  await page.waitForTimeout(200)
  if (await page.getByText('任务队列', { exact: true }).count()) throw new Error('取消文件选择后不应创建任务。')

  const produced = []
  for (let index = 0; index < presetCases.length; index += 1) {
    const preset = presetCases[index]
    if (index === 0) await dropZone.click()
    else await page.getByRole('button', { name: /把视频拖到这里/ }).click()

    await page.getByText('任务队列', { exact: true }).waitFor()
    await page.getByText('等待转换').waitFor({ timeout: 30_000 })
    const thumbnail = page.getByAltText(/缩略图$/)
    await thumbnail.waitFor()
    const thumbnailSource = await thumbnail.getAttribute('src')
    if (!thumbnailSource?.startsWith('data:image/')) throw new Error('未生成视频缩略图。')

    if (index === 0) {
      await page.getByRole('button', { name: '选择文件夹' }).click()
      await page.getByText(outputDirectory).waitFor()
    }

    await page.getByRole('button', { name: new RegExp(`^${preset.label}`) }).click()
    await page.getByRole('button', { name: /高级信息/ }).click()
    await page.locator('.advanced-panel code').waitFor()
    await page.getByRole('button', { name: /高级信息/ }).click()
    await page.getByRole('button', { name: /^开始转换/ }).click()
    await page.getByText('转换完成', { exact: true }).last().waitFor({ timeout: 180_000 })

    const outputPath = await page.locator('.success-card span').getAttribute('title')
    if (!outputPath || !existsSync(outputPath) || !outputPath.toLowerCase().endsWith(preset.extension)) {
      throw new Error(`${preset.label} 输出文件异常：${outputPath}`)
    }
    const probe = inspectOutput(outputPath)
    const video = probe.streams.find((stream) => stream.codec_type === 'video')
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    if (preset.videoCodec && video?.codec_name !== preset.videoCodec) {
      throw new Error(`${preset.label} 视频编码不符：${video?.codec_name}`)
    }
    if (preset.audioCodec && (video || audio?.codec_name !== preset.audioCodec)) {
      throw new Error(`${preset.label} 音频输出不符：${JSON.stringify(probe.streams)}`)
    }
    produced.push({ preset: preset.label, outputPath, duration: Number(probe.format.duration) })

    await page.getByRole('button', { name: '打开位置' }).click()
    const shownItem = await app.evaluate(() => globalThis.__frameFlowShownItem)
    if (shownItem !== outputPath) throw new Error(`打开位置调用异常：${shownItem}`)

    if (index === presetCases.length - 1) {
      await page.screenshot({ path: completedScreenshot })
    } else {
      await page.getByRole('button', { name: '清除已完成' }).click()
      await page.getByRole('button', { name: /把视频拖到这里/ }).waitFor()
    }
  }

  const cancellation = await page.evaluate(async ({ inputPath, outputDirectory }) => {
    const jobId = `cancel-smoke-${Date.now()}`
    const conversion = window.frameFlow.startConversion({
      jobId,
      inputPath,
      outputDirectory,
      presetId: 'mp4-h265'
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const acknowledged = await window.frameFlow.cancelConversion(jobId)
    try {
      await conversion
      return { acknowledged, outcome: 'completed' }
    } catch (error) {
      return {
        acknowledged,
        outcome: 'cancelled',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }, { inputPath: sourcePath, outputDirectory })
  if (!cancellation.acknowledged || cancellation.outcome !== 'cancelled' || !cancellation.message?.includes('取消')) {
    throw new Error(`正式包取消链路异常：${JSON.stringify(cancellation)}`)
  }
  if (readdirSync(outputDirectory).some((name) => name.includes('cancel-smoke') && name.includes('.part'))) {
    throw new Error('取消任务后仍残留临时文件。')
  }

  const finalMetrics = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    workspace: (() => {
      const rect = document.querySelector('.workspace')?.getBoundingClientRect()
      return rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left } : undefined
    })()
  }))
  if (finalMetrics.document.width > finalMetrics.viewport.width || finalMetrics.document.height > finalMetrics.viewport.height) {
    throw new Error(`完成态出现非预期页面滚动：${JSON.stringify(finalMetrics)}`)
  }

  console.log(JSON.stringify({ toolchain, initialMetrics, finalMetrics, produced, cancellation, screenshots: [initialScreenshot, completedScreenshot] }, null, 2))
} finally {
  await app.close().catch(() => undefined)
}
