import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import type { ConversionRequest } from '../shared/contracts'
import { ConversionService } from './conversion-service'
import { inspectMedia } from './media-service'
import { getToolchainStatus } from './toolchain'

let mainWindow: BrowserWindow | undefined
let conversionService: ConversionService | undefined

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
      preload: join(__dirname, '../preload/index.js'),
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
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:choose-videos', async () => {
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
  ipcMain.handle('dialog:choose-output', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择输出文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? undefined : result.filePaths[0]
  })
  ipcMain.handle('media:inspect', (_event, filePath: string) => inspectMedia(filePath))
  ipcMain.handle('toolchain:status', () => getToolchainStatus())
  ipcMain.handle('conversion:start', (_event, request: ConversionRequest) => conversionService!.start(request))
  ipcMain.handle('conversion:cancel', (_event, jobId: string) => conversionService?.cancel(jobId) ?? false)
  ipcMain.handle('shell:open-path', (_event, path: string) => shell.openPath(path))
  ipcMain.handle('shell:show-item', (_event, path: string) => shell.showItemInFolder(path))
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
