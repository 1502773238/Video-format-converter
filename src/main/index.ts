import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ConversionRequest } from '../shared/contracts'
import { ConversionService } from './conversion-service'
import { inspectMedia } from './media-service'
import { getToolchainStatus } from './toolchain'
import { assertSafeJobId, assertStringPath } from './validation'

let mainWindow: BrowserWindow | undefined
let conversionService: ConversionService | undefined
const externalUrlAllowlist = new Set(['https://github.com/1502773238/Video-format-converter'])

function isAllowedRendererUrl(rawUrl: string): boolean {
  try {
    const candidate = new URL(rawUrl)
    const developmentUrl = process.env['ELECTRON_RENDERER_URL']
    if (developmentUrl) return candidate.origin === new URL(developmentUrl).origin
    const entryUrl = pathToFileURL(join(__dirname, '../renderer/index.html'))
    return candidate.protocol === 'file:' && candidate.pathname === entryUrl.pathname
  } catch {
    return false
  }
}

function assertTrustedIpc(event: IpcMainInvokeEvent): void {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    !isAllowedRendererUrl(event.senderFrame.url)
  ) {
    throw new Error('拒绝来自非主界面的请求。')
  }
}

function parseConversionRequest(value: unknown): ConversionRequest {
  if (!value || typeof value !== 'object') throw new Error('转换请求无效。')
  const candidate = value as Record<string, unknown>
  assertSafeJobId(candidate.jobId)
  assertStringPath(candidate.inputPath, '输入文件路径')
  if (candidate.outputDirectory !== undefined) assertStringPath(candidate.outputDirectory, '输出文件夹路径')
  if (typeof candidate.presetId !== 'string') throw new Error('转换预设无效。')
  return {
    jobId: candidate.jobId,
    inputPath: candidate.inputPath,
    outputDirectory: candidate.outputDirectory,
    presetId: candidate.presetId as ConversionRequest['presetId']
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0e14',
    title: 'FrameFlow',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  conversionService = new ConversionService(mainWindow)
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    conversionService?.cancelAll()
    conversionService = undefined
    mainWindow = undefined
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (externalUrlAllowlist.has(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url)) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:choose-videos', async (event) => {
    assertTrustedIpc(event)
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择视频文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'm4v', 'wmv', 'ts'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle('dialog:choose-output', async (event) => {
    assertTrustedIpc(event)
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择输出文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? undefined : result.filePaths[0]
  })
  ipcMain.handle('media:inspect', (event, filePath: unknown) => {
    assertTrustedIpc(event)
    assertStringPath(filePath, '媒体文件路径')
    return inspectMedia(filePath)
  })
  ipcMain.handle('toolchain:status', (event) => {
    assertTrustedIpc(event)
    return getToolchainStatus()
  })
  ipcMain.handle('conversion:start', (event, request: unknown) => {
    assertTrustedIpc(event)
    return conversionService!.start(parseConversionRequest(request))
  })
  ipcMain.handle('conversion:cancel', (event, jobId: unknown) => {
    assertTrustedIpc(event)
    assertSafeJobId(jobId)
    return conversionService?.cancel(jobId) ?? false
  })
  ipcMain.handle('shell:show-item', (event, path: unknown) => {
    assertTrustedIpc(event)
    assertStringPath(path, '输出文件路径')
    if (!conversionService?.canRevealOutput(path)) throw new Error('只能打开本次转换生成的文件位置。')
    shell.showItemInFolder(path)
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.frameflow.desktop')
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
