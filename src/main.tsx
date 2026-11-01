import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import QuickMenu from './quick-menu/QuickMenu'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './style.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isTauri() && getCurrentWindow().label === 'quick' ? <QuickMenu /> : <App />}</React.StrictMode>,
)
