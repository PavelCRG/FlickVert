import { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { convertImage, fitWithin } from './conversion/images'
import { imagesToPdf } from './conversion/pdf'
import { loadSettings } from './settings'
import { t, type MessageKey } from './i18n'
import './quick-menu.css'

type NativeFile = { path: string; name: string; size: number; extension: string; mime: string }
type Format = { extension: string; label: string }
type Position = { x: number; y: number }
const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const quickActions = [
  { id: 'convert', label: 'Convert' as const, glyph: '↔' },
  { id: 'resize', label: 'Resize' as const, glyph: '⌗' },
  { id: 'settings', label: 'Settings' as const, glyph: '⚙' },
]
const toolActions = [
  { id: 'images-to-pdf', label: 'Images to PDF' as const, glyph: 'PDF' },
  { id: 'resize', label: 'Resize' as const, glyph: '↔' },
  { id: 'rotate', label: 'Rotate' as const, glyph: '↻' },
  { id: 'flip', label: 'Flip' as const, glyph: '⇋' },
  { id: 'grayscale', label: 'Grayscale' as const, glyph: '◐' },
  { id: 'square', label: 'Square crop' as const, glyph: '□' },
  { id: 'compress', label: 'Compress' as const, glyph: '◒' },
]
const videoToolActions = [
  { id: 'compress-video', label: 'Compress' as const, glyph: '◒' },
  { id: 'mute-video', label: 'Mute video' as const, glyph: '◖' },
  { id: 'extract-audio', label: 'Extract audio' as const, glyph: '♫' },
  { id: 'video-thumbnail', label: 'Create thumbnail' as const, glyph: '▣' },
]
const audioToolActions = [
  { id: 'compress-audio', label: 'Compress' as const, glyph: '◒' },
  { id: 'normalize-audio', label: 'Normalize audio' as const, glyph: '▂' },
]
const allToolActions = [...toolActions, ...videoToolActions, ...audioToolActions]
const fileActions = [
  { id: 'create-zip', label: 'Create ZIP' as const, glyph: '▱' },
  { id: 'extract-zip', label: 'Extract ZIP' as const, glyph: '▣' },
  { id: 'copy-to-folder', label: 'Copy to FlickVert' as const, glyph: '⧉' },
  { id: 'move-to-folder', label: 'Move to FlickVert' as const, glyph: '⇥' },
  { id: 'reveal', label: 'Show in folder' as const, glyph: '↗' },
  { id: 'copy-path', label: 'Copy path' as const, glyph: '⎘' },
]

function toolActionsFor(files: NativeFile[], ffmpegAvailable: boolean) {
  if (files.length && files.every((file) => imageExtensions.includes(file.extension))) return toolActions
  if (ffmpegAvailable && files.length && files.every((file) => file.mime.startsWith('video/'))) return videoToolActions
  if (ffmpegAvailable && files.length && files.every((file) => file.mime.startsWith('audio/'))) return audioToolActions
  return []
}

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
  const [wheelMode, setWheelMode] = useState<'convert' | 'tools' | 'actions'>('convert')
  const [files, setFiles] = useState<NativeFile[]>([])
  const [formats, setFormats] = useState<Format[]>([])
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState('')
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false)
  const dragModeRef = useRef(false)
  const wheelModeRef = useRef<'convert' | 'tools' | 'actions'>('convert')
  const filesRef = useRef<NativeFile[]>([])
  const ffmpegAvailableRef = useRef(false)
  const formatsRef = useRef<Format[]>([])
  const dropHandled = useRef(false)
  const hideTimer = useRef<number | undefined>(undefined)

  function setDragVisible(value: boolean) {
    dragModeRef.current = value
    setDragMode(value)
  }

  function setActiveWheelMode(value: 'convert' | 'tools' | 'actions') {
    wheelModeRef.current = value
    setWheelMode(value)
  }

  function hide() {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    setDragVisible(false)
    setActiveWheelMode('convert')
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
    setDragVisible(true)
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
      for (const file of items) {
        const output = await convertTo(file, format)
        outputs.push(output)
        await emit('flickvert://job-completed', { fileName: file.name, size: file.size, output })
      }
      setStatus(`${tr('Saved')} · ${outputs.length}`)
      window.setTimeout(hide, 650)
    } catch (error) {
      setStatus(`${tr('Could not convert')}: ${String(error).slice(0, 100)}`)
      dropHandled.current = false
    }
  }

  async function processImages(items: NativeFile[], actionId: string) {
    dropHandled.current = true
    setStatus(tr(actionId === 'resize' ? 'Resizing...' : 'Processing...'))
    try {
      if (actionId === 'images-to-pdf') {
        if (items.length > 100) throw new Error('Select up to 100 images')
        if (items.reduce((size, file) => size + file.size, 0) > 32 * 1024 * 1024) throw new Error('Images exceed the 32 MB limit')
        const inputs: File[] = []
        for (const file of items) {
          const bytes = await invoke<number[]>('read_dropped_file', { inputPath: file.path })
          inputs.push(new File([Uint8Array.from(bytes)], file.name, { type: file.mime }))
        }
        const bytes = await imagesToPdf(inputs, loadSettings().quality)
        const name = items.length === 1 ? items[0].name.replace(/\.[^.]+$/, '') : 'images'
        const output = await invoke<string>('save_output', { fileName: `${name}.pdf`, inputPath: items[0].path, bytes: Array.from(bytes) })
        await emit('flickvert://job-completed', { fileName: `${name}.pdf`, size: bytes.length, output })
        setStatus(tr('PDF created'))
        window.setTimeout(hide, 650)
        return
      }
      for (const file of items) {
        if (!imageExtensions.includes(file.extension)) throw new Error('Image tools are available for images')
        const bytes = await invoke<number[]>('read_dropped_file', { inputPath: file.path })
        const input = new File([Uint8Array.from(bytes)], file.name, { type: file.mime })
        const bitmap = await createImageBitmap(input)
        const side = Math.min(bitmap.width, bitmap.height)
        const size = actionId === 'resize' ? fitWithin(bitmap.width, bitmap.height, 1920, 1920) : actionId === 'square' ? { width: side, height: side } : actionId === 'rotate' ? { width: bitmap.height, height: bitmap.width } : { width: bitmap.width, height: bitmap.height }
        const canvas = document.createElement('canvas')
        canvas.width = size.width
        canvas.height = size.height
        const context = canvas.getContext('2d')
        if (!context) { bitmap.close(); throw new Error('Could not create image canvas') }
        if (actionId === 'compress') { context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height) }
        if (actionId === 'rotate') { context.translate(size.width, 0); context.rotate(Math.PI / 2) }
        if (actionId === 'flip') { context.translate(size.width, 0); context.scale(-1, 1) }
        if (actionId === 'grayscale') context.filter = 'grayscale(1)'
        if (actionId === 'square') context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, side, side)
        else context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height)
        bitmap.close()
        const extension = actionId === 'compress' ? 'jpg' : ['png', 'jpg', 'jpeg', 'webp'].includes(file.extension) ? file.extension : 'webp'
        const format = extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'image/webp'
        const quality = actionId === 'compress' ? Math.min(loadSettings().quality, 76) / 100 : loadSettings().quality / 100
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Image processing failed')), format, quality))
        const suffix = actionId === 'resize' ? '-resized' : actionId === 'rotate' ? '-rotated' : actionId === 'flip' ? '-flipped' : actionId === 'grayscale' ? '-grayscale' : actionId === 'square' ? '-square' : '-compressed'
        const output = await invoke<string>('save_output', {
          fileName: `${file.name.replace(/\.[^.]+$/, '')}${suffix}.${extension === 'jpeg' ? 'jpg' : extension}`,
          inputPath: file.path,
          bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
        })
        await emit('flickvert://job-completed', { fileName: file.name, size: file.size, output })
      }
      setStatus(tr('Saved'))
      window.setTimeout(hide, 650)
    } catch (error) {
      setStatus(`${tr('Could not convert')}: ${String(error).slice(0, 100)}`)
      dropHandled.current = false
    }
  }

  async function runTool(actionId: string, items: NativeFile[]) {
    if (toolActions.some((action) => action.id === actionId)) {
      await processImages(items, actionId)
      return
    }
    dropHandled.current = true
    setStatus(tr('Processing...'))
    try {
      for (const file of items) {
        const output = await invoke<string>('process_media_tool', { inputPath: file.path, actionId })
        await emit('flickvert://job-completed', { fileName: file.name, size: file.size, output })
      }
      setStatus(tr('Saved'))
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
      if (wheelModeRef.current === 'actions') {
        const index = selectedSector(point, size, fileActions.length)
        const id = fileActions[index]?.id
        if (index >= 0 && received.length && (id === 'copy-to-folder' || id === 'create-zip' || received.length === 1)) await choose(id)
        return
      }
      if (wheelModeRef.current === 'tools') {
        const actions = toolActionsFor(received, ffmpegAvailableRef.current)
        const index = selectedSector(point, size, actions.length)
        if (index >= 0) await runTool(actions[index].id, received)
        return
      }
      const index = selectedSector(point, size, options.length)
      if (wheelModeRef.current === 'convert' && index >= 0 && received.length) await convertFiles(received, options[index])
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
    void invoke<{ ffmpeg: boolean }>('engine_status').then(({ ffmpeg }) => { ffmpegAvailableRef.current = ffmpeg; setFfmpegAvailable(ffmpeg) }).catch(() => {})

    void getCurrentWindow().onFocusChanged(({ payload }) => {
      if (!payload) {
        hideTimer.current = window.setTimeout(() => { if (!dragModeRef.current) hide() }, 150)
      } else if (hideTimer.current !== undefined) {
        window.clearTimeout(hideTimer.current)
      }
    }).then(addStop)
    void listen('flickvert://drag-wheel-open', async () => {
      const opened = await invoke<boolean>('take_drag_trigger').catch(() => false)
      if (opened) { setDragVisible(true); setActiveWheelMode('convert'); setStatus(''); dropHandled.current = false }
    }).then(addStop)
    void listen<string>('flickvert://drag-wheel-mode', ({ payload }) => {
      if (payload === 'tools' || payload === 'actions' || payload === 'convert') setActiveWheelMode(payload)
    }).then(addStop)
    void listen('flickvert://drag-ended', () => {
      if (dropHandled.current) return
      hideTimer.current = window.setTimeout(hide, 280)
    }).then(addStop)
    void listen('flickvert://cancel-drag-wheel', hide).then(addStop)
    void invoke<boolean>('take_drag_trigger').then((opened) => {
      if (opened) { setDragVisible(true); dropHandled.current = false }
    }).catch(() => {})

    void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === 'enter') {
        if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
        void refreshFiles(payload.paths).catch((error) => setStatus(String(error)))
      } else if (payload.type === 'over') {
        void getCurrentWindow().innerSize().then((size) => setActive(selectedSector(payload.position, size, wheelModeRef.current === 'tools' ? toolActionsFor(filesRef.current, ffmpegAvailableRef.current).length : wheelModeRef.current === 'actions' ? fileActions.length : formatsRef.current.length)))
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
    try {
      if (actionId === 'resize' && dragModeRef.current && filesRef.current.length) {
        await runTool(actionId, filesRef.current)
        return
      } else if (allToolActions.some((action) => action.id === actionId) && dragModeRef.current && filesRef.current.length) {
        await runTool(actionId, filesRef.current)
        return
      } else if (actionId === 'create-zip') {
        const items = filesRef.current
        const output = await invoke<string>('create_zip_archive', { inputPaths: items.map((file) => file.path) })
        await emit('flickvert://job-completed', { fileName: `${items.length} files`, size: items.reduce((sum, file) => sum + file.size, 0), output })
        setStatus(`${tr('Archive created')}: ${output.split(/[\\/]/).pop()}`)
      } else if (actionId === 'extract-zip') {
        const file = filesRef.current[0]
        if (!file) return
        const output = await invoke<string>('extract_zip_archive', { inputPath: file.path })
        await emit('flickvert://job-completed', { fileName: file.name, size: file.size, output })
        setStatus(`${tr('Archive extracted')}: ${output.split(/[\\/]/).pop()}`)
      } else if (actionId === 'copy-to-folder' || actionId === 'move-to-folder') {
        const items = actionId === 'copy-to-folder' ? filesRef.current : filesRef.current.slice(0, 1)
        if (!items.length) return
        for (const file of items) await invoke<string>(actionId === 'copy-to-folder' ? 'copy_to_flickvert_folder' : 'move_to_flickvert_folder', { inputPath: file.path })
        setStatus(actionId === 'copy-to-folder' ? `${tr('Copied files')}: ${items.length}` : tr('Moved to FlickVert'))
      } else if (actionId === 'reveal' || actionId === 'copy-path') {
        const path = filesRef.current[0]?.path
        if (!path) return
        await invoke(actionId === 'reveal' ? 'reveal_dropped_file' : 'copy_dropped_file_path', { inputPath: path })
        setStatus(tr(actionId === 'reveal' ? 'Show in folder' : 'Path copied'))
      } else {
        await invoke('quick_action', { actionId })
      }
      if (['create-zip', 'extract-zip', 'copy-to-folder', 'move-to-folder', 'reveal', 'copy-path'].includes(actionId)) window.setTimeout(hide, 650)
      else await getCurrentWindow().hide()
    } catch (error) {
      setStatus(String(error).slice(0, 120))
    }
  }

  return <main className={`quick-shell${dragMode ? ' drag-mode' : ''}`} aria-label="FlickVert quick actions">
    <header><img src="/fv-mark.svg" alt=""/><span>FlickVert</span><kbd>ESC</kbd></header>
    {formats.length > 0 && wheelMode === 'convert' ? <div className="quick-orbit" aria-label={tr('Select output format')}>
      <div className="quick-center"><img className="quick-monogram" src="/fv-mark.svg" alt="FlickVert"/><span>{files.length === 1 ? files[0].name : `${files.length} ${tr('files')}`}</span></div>
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
      <div className="quick-center"><img className="quick-monogram" src="/fv-mark.svg" alt="FlickVert"/><span>{status || (files.length ? tr('No formats available') : dragMode ? tr('Drag a file here') : tr('Choose an action'))}</span></div>
      {(dragMode ? wheelMode === 'actions' ? fileActions : wheelMode === 'tools' ? toolActionsFor(files, ffmpegAvailable) : quickActions : quickActions).map((action, index, entries) => {
        const angle = (index / entries.length) * Math.PI * 2 - Math.PI / 2
        const needsOneFile = ['extract-zip', 'move-to-folder', 'reveal', 'copy-path'].includes(action.id)
        const imageTool = allToolActions.some((tool) => tool.id === action.id)
        const unavailableTool = imageTool && dragMode && !toolActionsFor(files, ffmpegAvailable).some((tool) => tool.id === action.id)
        const unavailableArchive = dragMode && (action.id === 'create-zip' ? files.length === 0 : action.id === 'extract-zip' && (files.length !== 1 || files[0]?.extension !== 'zip'))
        return <button key={action.id} className={`quick-action action-${action.id}${active === index ? ' active' : ''}`} style={{ left: `${50 + Math.cos(angle) * 34}%`, top: `${50 + Math.sin(angle) * 34}%` }} onClick={() => void choose(action.id)} disabled={(needsOneFile && files.length !== 1) || unavailableTool || unavailableArchive}><span>{action.glyph}</span><small>{tr(action.label)}</small></button>
      })}
    </div>}
    <footer>{status || (formats.length ? `${tr('Drop on a format')} · ${files.length} ${tr(files.length === 1 ? 'file' : 'files')}` : dragMode ? tr('Drag a file here') : tr('Choose an action'))}</footer>
  </main>
}
