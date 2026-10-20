import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import QuickMenu from './QuickMenu'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './style.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{getCurrentWindow().label === 'quick' ? <QuickMenu /> : <App />}</React.StrictMode>,
)
