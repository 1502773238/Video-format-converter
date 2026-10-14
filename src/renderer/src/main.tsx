import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { createMockDesktopApi } from './mock-desktop-api'
import './styles.css'

if (!window.frameFlow) {
  if (navigator.userAgent.includes('Electron')) {
    throw new Error('FrameFlow preload API 未加载，已停止启动以避免误用模拟数据。')
  }
  window.frameFlow = createMockDesktopApi()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
