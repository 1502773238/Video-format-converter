import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ConversionProgress, ConversionRequest, DesktopApi } from '../shared/contracts'

const api: DesktopApi = {
  chooseVideos: () => ipcRenderer.invoke('dialog:choose-videos'),
  chooseOutputDirectory: () => ipcRenderer.invoke('dialog:choose-output'),
  inspectMedia: (filePath) => ipcRenderer.invoke('media:inspect', filePath),
  getToolchainStatus: () => ipcRenderer.invoke('toolchain:status'),
  startConversion: (request: ConversionRequest) => ipcRenderer.invoke('conversion:start', request),
  cancelConversion: (jobId) => ipcRenderer.invoke('conversion:cancel', jobId),
  openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
  showItemInFolder: (path) => ipcRenderer.invoke('shell:show-item', path),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onConversionProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ConversionProgress): void => listener(progress)
    ipcRenderer.on('conversion:progress', handler)
    return () => ipcRenderer.removeListener('conversion:progress', handler)
  }
}

contextBridge.exposeInMainWorld('frameFlow', api)
