import { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { convertImage } from './conversion/images'
import { loadSettings } from './settings'
import { t, type MessageKey } from './i18n'
import './quick-menu.css'

type NativeFile = { path: string; name: string; size: number; extension: string; mime: string }
type Format = { extension: string; label: string }
type Position = { x: number; y: number }
const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const actions = [
  { id: 'convert', label: 'Convert' as const, glyph: '↔' },
  { id: 'resize', label: 'Resize' as const, glyph: '⌗' },
  { id: 'settings', label: 'Settings' as const, glyph: '⚙' },
]

function outputLabel(extension: string) {
  return extension === 'jpg' ? 'JPEG' : extension.toUpperCase()
}

function selectedSector(point: Position, size: { width: number; height: number }, count: number) {
  if (!count) return -1
  const dx = point.x - size.width / 2
  const dy = point.y - size.height / 2
  if (Math.hypot(dx, dy) < Math.min(size.width, size.height) * 0.2) return -1
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
  return Math.floor(angle / (Math.PI * 2 / count))
}

export default function QuickMenu() {
  const settings = loadSettings()
  const tr = (key: MessageKey) => t(settings.language, key)
  const [dragMode, setDragMode] = useState(false)
  const [files, setFiles] = useState<NativeFile[]>([])
  const [formats, setFormats] = useState<Format[]>([])
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState('')
  const dragModeRef = useRef(false)
  const filesRef = useRef<NativeFile[]>([])
  const formatsRef = useRef<Format[]>([])
  const dropHandled = useRef(false)
  const hideTimer = useRef<number | undefined>(undefined)

  function setWheelMode(value: boolean) {
    dragModeRef.current = value
    setDragMode(value)
  }

  function hide() {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    setWheelMode(false)
    setActive(-1)
    void getCurrentWindow().hide()
  }

  async function refreshFiles(paths: string[]) {
    const received = await invoke<NativeFile[]>('inspect_dropped_files', { paths })
    if (!received.length) return { received, options: [] as Format[] }
    const lists = await Promise.all(received.map((file) => invoke<string[]>('quick_formats', { inputPath: file.path })))
    const common = lists[0].filter((extension) => lists.every((list) => list.includes(extension)))
    const options = common.map((extension) => ({ extension, label: outputLabel(extension) }))
    filesRef.current = received
    formatsRef.current = options
    setFiles(received)
    setFormats(options)
    setWheelMode(true)
    setStatus('')
    dropHandled.current = false
    return { received, options }
  }

  async function convertTo(file: NativeFile, format: Format) {
    const stem = file.name.replace(/\.[^.]+$/, '')
    if (imageExtensions.includes(file.extension)) {
      const preferences = loadSettings()
      const bytes = await invoke<number[]>('read_dropped_file', { inputPath: file.path })
      const input = new File([Uint8Array.from(bytes)], file.name, { type: file.mime })
      const outputType = format.extension === 'png' ? 'image/png' : format.extension === 'jpg' ? 'image/jpeg' : 'image/webp'
      const blob = await convertImage(input, { format: outputType, quality: preferences.quality, width: preferences.width, height: preferences.height })
      return invoke<string>('save_output', {
        fileName: `${stem}.${format.extension}`,
        inputPath: file.path,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      })
    }
    return invoke<string>('convert_file', { inputPath: file.path, outputExtension: format.extension })
  }

  async function convertFiles(items: NativeFile[], format: Format) {
    dropHandled.current = true
    setStatus(tr('Converting...'))
    try {
      const outputs: string[] = []
      for (const file of items) outputs.push(await convertTo(file, format))
      setStatus(`${tr('Saved')} · ${outputs.length}`)
      window.setTimeout(hide, 650)
    } catch (error) {
      setStatus(`${tr('Could not convert')}: ${String(error).slice(0, 100)}`)
      dropHandled.current = false
    }
  }

  async function dropFiles(paths: string[], point: Position) {
    try {
      const { received, options } = await refreshFiles(paths)
      const size = await getCurrentWindow().innerSize()
      const index = selectedSector(point, size, options.length)
      if (index >= 0 && received.length) await convertFiles(received, options[index])
    } catch (error) {
      setStatus(String(error).slice(0, 160))
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') hide() }
    window.addEventListener('keydown', onKeyDown)
    let disposed = false
    const stops: (() => void)[] = []
    const addStop = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }

    void getCurrentWindow().onFocusChanged(({ payload }) => {
      if (!payload) {
        hideTimer.current = window.setTimeout(() => { if (!dragModeRef.current) hide() }, 150)
      } else if (hideTimer.current !== undefined) {
        window.clearTimeout(hideTimer.current)
      }
    }).then(addStop)
    void listen('flickvert://drag-wheel-open', async () => {
      const opened = await invoke<boolean>('take_drag_trigger').catch(() => false)
      if (opened) { setWheelMode(true); setStatus(''); dropHandled.current = false }
    }).then(addStop)
    void listen('flickvert://drag-ended', () => {
      if (dropHandled.current) return
      hideTimer.current = window.setTimeout(hide, 280)
    }).then(addStop)
    void listen('flickvert://cancel-drag-wheel', hide).then(addStop)
    void invoke<boolean>('take_drag_trigger').then((opened) => {
      if (opened) { setWheelMode(true); dropHandled.current = false }
    }).catch(() => {})

    void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === 'enter') {
        if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
        void refreshFiles(payload.paths).catch((error) => setStatus(String(error)))
      } else if (payload.type === 'over') {
        void getCurrentWindow().innerSize().then((size) => setActive(selectedSector(payload.position, size, formatsRef.current.length)))
      } else if (payload.type === 'drop') {
        if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
        dropHandled.current = true
        void dropFiles(payload.paths, payload.position)
      } else {
        setActive(-1)
      }
    }).then(addStop)

    return () => {
      disposed = true
      window.removeEventListener('keydown', onKeyDown)
      stops.forEach((stop) => stop())
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    }
  }, [])

  async function choose(actionId: string) {
    await invoke('quick_action', { actionId })
    await getCurrentWindow().hide()
  }

  return <main className={`quick-shell${dragMode ? ' drag-mode' : ''}`} aria-label="FlickVert quick actions">
    <header><img src="/fv-mark.svg" alt=""/><span>FlickVert</span><kbd>ESC</kbd></header>
    {formats.length > 0 ? <div className="quick-orbit" aria-label={tr('Select output format')}>
      <div className="quick-center"><strong>FV</strong><span>{files.length === 1 ? files[0].name : `${files.length} ${tr('files')}`}</span></div>
      {formats.map((format, index) => {
        const angle = (index / formats.length) * Math.PI * 2 - Math.PI / 2
        const distance = formats.length > 5 ? 35 : 33
        const left = 50 + Math.cos(angle) * distance
        const top = 50 + Math.sin(angle) * distance
        return <button key={format.extension} className={`quick-format${active === index ? ' active' : ''}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={() => void convertFiles(filesRef.current, format)} aria-label={`${tr('Convert to')} ${format.label}`}>
          <strong>{format.label}</strong><small>{tr('Convert to')}</small>
        </button>
      })}
    </div> : <div className="quick-orbit quick-actions">
      <div className="quick-center"><strong>FV</strong><span>{status || (files.length ? tr('No formats available') : dragMode ? tr('Drag a file here') : tr('Choose an action'))}</span></div>
      {!dragMode && actions.map((action, index) => {
        const angle = (index / actions.length) * Math.PI * 2 - Math.PI / 2
        return <button key={action.id} className={`quick-action action-${action.id}`} style={{ left: `${50 + Math.cos(angle) * 34}%`, top: `${50 + Math.sin(angle) * 34}%` }} onClick={() => void choose(action.id)}><span>{action.glyph}</span><small>{tr(action.label)}</small></button>
      })}
    </div>}
    <footer>{status || (formats.length ? `${tr('Drop on a format')} · ${files.length} ${tr(files.length === 1 ? 'file' : 'files')}` : dragMode ? tr('Drag a file here') : tr('Choose an action'))}</footer>
  </main>
}
