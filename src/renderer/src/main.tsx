import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { createMockDesktopApi } from './mock-desktop-api'
import './styles.css'

if (!window.frameFlow) {
  window.frameFlow = createMockDesktopApi()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
