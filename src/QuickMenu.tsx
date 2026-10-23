import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { convertImage, fitWithin } from './conversion/images'
import { imagesToPdf } from './conversion/pdf'
import { loadSettings } from './settings'
import { t, type MessageKey } from './i18n'
import { canRunSelectedTool } from './quick-actions'
import { wheelLabelPosition, wheelSlicePath } from './radial-wheel'
import './quick-menu.css'

type NativeFile = { path: string; name: string; size: number; extension: string; mime: string; isDirectory: boolean }
type Format = { extension: string; label: string }
type Position = { x: number; y: number }
type WheelChoice = { key: string; label: string; glyph?: string; disabled: boolean; onChoose: () => void }
const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
const extendedImageExtensions = [...imageExtensions, 'heic', 'heif', 'avif', 'tif', 'tiff', 'svg']
const toolActions = [
  { id: 'image-editor', label: 'Edit image' as const, glyph: '✦' },
  { id: 'images-to-pdf', label: 'Images to PDF' as const, glyph: 'PDF' },
  { id: 'resize', label: 'Resize' as const, glyph: '↔' },
  { id: 'rotate', label: 'Rotate' as const, glyph: '↻' },
  { id: 'flip', label: 'Flip' as const, glyph: '⇋' },
  { id: 'grayscale', label: 'Grayscale' as const, glyph: '◐' },
  { id: 'square', label: 'Square crop' as const, glyph: '□' },
  { id: 'compress', label: 'Compress' as const, glyph: '◒' },
  { id: 'metadata', label: 'Remove metadata' as const, glyph: '◇' },
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
const archiveToolActions = [{ id: 'extract-zip', label: 'Extract ZIP' as const, glyph: 'ZIP' }]
const allToolActions = [...toolActions, ...videoToolActions, ...audioToolActions]
const quickWindowSize = { width: 336, height: 336 }
const fileActions = [
  { id: 'create-zip', label: 'Create ZIP' as const, glyph: '▱' },
  { id: 'extract-zip', label: 'Extract ZIP' as const, glyph: '▣' },
  { id: 'copy-to-folder', label: 'Copy to FlickVert' as const, glyph: '⧉' },
  { id: 'move-to-folder', label: 'Move to FlickVert' as const, glyph: '⇥' },
  { id: 'reveal', label: 'Show in folder' as const, glyph: '↗' },
  { id: 'copy-path', label: 'Copy path' as const, glyph: '⎘' },
  { id: 'open-terminal', label: 'Open Terminal' as const, glyph: '>_' },
]

function toolActionsFor(files: NativeFile[], ffmpegAvailable: boolean, imagemagickAvailable: boolean) {
  if (files.length === 1 && files[0].extension === 'zip') return archiveToolActions
  if (files.length && files.every((file) => imageExtensions.includes(file.extension))) return files.some((file) => file.extension === 'svg') ? toolActions.filter((action) => action.id !== 'image-editor') : toolActions
  if (imagemagickAvailable && files.length && files.every((file) => extendedImageExtensions.includes(file.extension))) return toolActions.filter((action) => !['image-editor', 'images-to-pdf', 'square'].includes(action.id))
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
  const radius = Math.hypot(dx, dy)
  if (radius < Math.min(size.width, size.height) * 0.215 || radius > Math.min(size.width, size.height) * 0.47) return -1
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)
  return Math.floor((angle + Math.PI / count) / (Math.PI * 2 / count)) % count
}

function WheelChoices({ items, active, onActive }: { items: WheelChoice[]; active: number; onActive: (index: number) => void }) {
  return <>
    <svg className="quick-segments" viewBox="0 0 352 352" role="group" aria-label="Available actions">
      {items.map((item, index) => <path
        key={item.key}
        d={wheelSlicePath(index, items.length)}
        className={`quick-segment${active === index ? ' active' : ''}${item.disabled ? ' disabled' : ''}`}
        role="button"
        aria-label={item.label}
        aria-disabled={item.disabled}
        tabIndex={item.disabled ? -1 : 0}
        onPointerEnter={() => { if (!item.disabled) onActive(index) }}
        onFocus={() => { if (!item.disabled) onActive(index) }}
        onClick={() => { if (!item.disabled) item.onChoose() }}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!item.disabled) item.onChoose() } }}
      ><title>{item.label}</title></path>)}
    </svg>
    <div className="quick-labels" aria-hidden="true">
      {items.map((item, index) => <span key={item.key} className={`quick-label${active === index ? ' active' : ''}${item.disabled ? ' disabled' : ''}`} style={wheelLabelPosition(index, items.length) as CSSProperties}>
        {item.glyph && <span className="quick-glyph">{item.glyph}</span>}
        <strong>{item.label}</strong>
      </span>)}
    </div>
  </>
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
  const [imagemagickAvailable, setImagemagickAvailable] = useState(false)
  const dragModeRef = useRef(false)
  const wheelModeRef = useRef<'convert' | 'tools' | 'actions'>('convert')
  const filesRef = useRef<NativeFile[]>([])
  const ffmpegAvailableRef = useRef(false)
  const imagemagickAvailableRef = useRef(false)
  const formatsRef = useRef<Format[]>([])
  const dropHandled = useRef(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const inspectedPaths = useRef('')
  const wheelSize = useRef(quickWindowSize)
  const inspectingPaths = useRef<{ signature: string; promise: Promise<{ received: NativeFile[]; options: Format[] }> } | null>(null)

  function setDragVisible(value: boolean) {
    dragModeRef.current = value
    setDragMode(value)
  }

  function setActiveWheelMode(value: 'convert' | 'tools' | 'actions') {
    wheelModeRef.current = value
    setWheelMode(value)
    setActive(-1)
  }

  function hide() {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    setDragVisible(false)
    setActiveWheelMode('convert')
    filesRef.current = []
    formatsRef.current = []
    inspectedPaths.current = ''
    inspectingPaths.current = null
    setFiles([])
    setFormats([])
    setActive(-1)
    setStatus('')
    dropHandled.current = false
    void getCurrentWindow().hide()
  }

  async function refreshFiles(paths: string[]) {
    const signature = JSON.stringify(paths)
    if (signature === inspectedPaths.current) return { received: filesRef.current, options: formatsRef.current }
    if (inspectingPaths.current?.signature === signature) return inspectingPaths.current.promise
    const promise = (async () => {
      const received = await invoke<NativeFile[]>('inspect_dropped_files', { paths })
      if (!received.length) {
        filesRef.current = []; formatsRef.current = []; setFiles([]); setFormats([])
        inspectedPaths.current = signature
        return { received, options: [] as Format[] }
      }
      const lists = await Promise.all(received.map((file): Promise<string[]> => file.isDirectory ? Promise.resolve([]) : invoke<string[]>('quick_formats', { inputPath: file.path })))
      const common = lists[0].filter((extension) => lists.every((list) => list.includes(extension)))
      const options = common.map((extension) => ({ extension, label: outputLabel(extension) }))
      filesRef.current = received
      formatsRef.current = options
      setFiles(received)
      setFormats(options)
      setDragVisible(true)
      setStatus('')
      dropHandled.current = false
      inspectedPaths.current = signature
      return { received, options }
    })()
    inspectingPaths.current = { signature, promise }
    try {
      return await promise
    } finally {
      if (inspectingPaths.current?.promise === promise) inspectingPaths.current = null
    }
  }

  async function convertTo(file: NativeFile, format: Format) {
    const stem = file.name.replace(/\.[^.]+$/, '')
    const preferences = loadSettings()
    if (imageExtensions.includes(file.extension) && (format.extension === 'pdf' || ['png', 'jpg', 'webp'].includes(format.extension))) {
      const bytes = await invoke<number[]>('read_dropped_file', { inputPath: file.path })
      const input = new File([Uint8Array.from(bytes)], file.name, { type: file.mime })
      if (format.extension === 'pdf') {
        const pdf = await imagesToPdf([input], preferences.quality)
        return invoke<string>('save_output', { fileName: `${stem}.pdf`, inputPath: file.path, destinationFolder: preferences.outputFolder, bytes: Array.from(pdf) })
      }
      const outputType = format.extension === 'png' ? 'image/png' : format.extension === 'jpg' ? 'image/jpeg' : 'image/webp'
      const blob = await convertImage(input, { format: outputType, quality: preferences.quality, width: preferences.width, height: preferences.height })
      return invoke<string>('save_output', {
        fileName: `${stem}.${format.extension}`,
        inputPath: file.path,
        destinationFolder: preferences.outputFolder,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      })
    }
    return invoke<string>('convert_file', { inputPath: file.path, outputExtension: format.extension, quality: preferences.quality, width: preferences.width, height: preferences.height, destinationFolder: preferences.outputFolder })
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
      if (actionId === 'image-editor') {
        if (items.length !== 1) throw new Error('Edit one image at a time')
        await invoke('open_image_editor', { inputPath: items[0].path })
        hide()
        return
      }
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
        const output = await invoke<string>('save_output', { fileName: `${name}.pdf`, inputPath: items[0].path, destinationFolder: loadSettings().outputFolder, bytes: Array.from(bytes) })
        await emit('flickvert://job-completed', { fileName: `${name}.pdf`, size: bytes.length, output })
        setStatus(tr('PDF created'))
        window.setTimeout(hide, 650)
        return
      }
      for (const file of items) {
        if (!imageExtensions.includes(file.extension)) {
          const preferences = loadSettings()
          const output = await invoke<string>('process_image_tool', { inputPath: file.path, actionId, quality: preferences.quality, width: preferences.width, height: preferences.height, destinationFolder: preferences.outputFolder })
          await emit('flickvert://job-completed', { fileName: file.name, size: file.size, output })
          continue
        }
        const bytes = await invoke<number[]>('read_dropped_file', { inputPath: file.path })
        const input = new File([Uint8Array.from(bytes)], file.name, { type: file.mime })
        const bitmap = await createImageBitmap(input)
        const side = Math.min(bitmap.width, bitmap.height)
        const preferences = loadSettings()
        const size = actionId === 'resize' ? fitWithin(bitmap.width, bitmap.height, preferences.width ?? 1920, preferences.height ?? 1920) : actionId === 'square' ? { width: side, height: side } : actionId === 'rotate' ? { width: bitmap.height, height: bitmap.width } : { width: bitmap.width, height: bitmap.height }
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
        const quality = preferences.quality / 100
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Image processing failed')), format, quality))
        const suffix = actionId === 'resize' ? '-resized' : actionId === 'rotate' ? '-rotated' : actionId === 'flip' ? '-flipped' : actionId === 'grayscale' ? '-grayscale' : actionId === 'square' ? '-square' : actionId === 'metadata' ? '-clean' : '-compressed'
        const output = await invoke<string>('save_output', {
          fileName: `${file.name.replace(/\.[^.]+$/, '')}${suffix}.${extension === 'jpeg' ? 'jpg' : extension}`,
          inputPath: file.path,
          destinationFolder: loadSettings().outputFolder,
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
    if (actionId === 'extract-zip') {
      await choose(actionId)
      return
    }
    if (toolActions.some((action) => action.id === actionId)) {
      await processImages(items, actionId)
      return
    }
    dropHandled.current = true
    setStatus(tr('Processing...'))
    try {
      for (const file of items) {
        const output = await invoke<string>('process_media_tool', { inputPath: file.path, actionId, destinationFolder: loadSettings().outputFolder })
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
      if (wheelModeRef.current === 'actions') {
        const index = selectedSector(point, wheelSize.current, fileActions.length)
        const id = fileActions[index]?.id
        if (index >= 0 && received.length && (id === 'copy-to-folder' || id === 'move-to-folder' || id === 'create-zip' || received.length === 1)) await choose(id)
        return
      }
      if (wheelModeRef.current === 'tools') {
        const actions = toolActionsFor(received, ffmpegAvailableRef.current, imagemagickAvailableRef.current)
        const index = selectedSector(point, wheelSize.current, actions.length)
        if (index >= 0) await runTool(actions[index].id, received)
        return
      }
      const index = selectedSector(point, wheelSize.current, options.length)
      if (wheelModeRef.current === 'convert' && index >= 0 && received.length) await convertFiles(received, options[index])
    } catch (error) {
      setStatus(String(error).slice(0, 160))
    }
  }

  useEffect(() => {
    let disposed = false
    const stops: (() => void)[] = []
    const addStop = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }
    void invoke<{ ffmpeg: boolean; imagemagick: boolean }>('engine_status').then(({ ffmpeg, imagemagick }) => { ffmpegAvailableRef.current = ffmpeg; setFfmpegAvailable(ffmpeg); imagemagickAvailableRef.current = imagemagick; setImagemagickAvailable(imagemagick) }).catch(() => {})

    void getCurrentWindow().onFocusChanged(({ payload }) => {
      if (!payload) {
        hideTimer.current = window.setTimeout(() => { if (!dragModeRef.current) hide() }, 150)
      } else if (hideTimer.current !== undefined) {
        window.clearTimeout(hideTimer.current)
      }
    }).then(addStop)
    void listen('flickvert://drag-wheel-open', async () => {
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
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
    void listen<string[]>('flickvert://shortcut-files', ({ payload }) => {
      setActiveWheelMode('convert')
      if (payload.length) void refreshFiles(payload).catch((error) => setStatus(String(error)))
      else if (dragModeRef.current) { filesRef.current = []; formatsRef.current = []; setFiles([]); setFormats([]); setStatus(tr('No selected files found')) }
      else { filesRef.current = []; formatsRef.current = []; setFiles([]); setFormats([]); setDragVisible(false) }
    }).then(addStop)
    void invoke<boolean>('take_drag_trigger').then((opened) => {
      if (opened) { setDragVisible(true); dropHandled.current = false }
    }).catch(() => {})

    void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === 'enter') {
        if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
        void getCurrentWindow().innerSize().then((size) => { wheelSize.current = size })
        setDragVisible(true)
        void refreshFiles(payload.paths).catch((error) => setStatus(String(error)))
      } else if (payload.type === 'over') {
        const count = wheelModeRef.current === 'tools' ? toolActionsFor(filesRef.current, ffmpegAvailableRef.current, imagemagickAvailableRef.current).length : wheelModeRef.current === 'actions' ? fileActions.length : formatsRef.current.length
        setActive(selectedSector(payload.position, wheelSize.current, count))
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
      stops.forEach((stop) => stop())
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    }
  }, [])

  async function choose(actionId: string) {
    try {
      if (canRunSelectedTool(actionId, allToolActions.map((action) => action.id), filesRef.current.length)) {
        await runTool(actionId, filesRef.current)
        return
      } else if (actionId === 'create-zip') {
        const items = filesRef.current
        const output = await invoke<string>('create_zip_archive', { inputPaths: items.map((file) => file.path), destinationFolder: loadSettings().outputFolder })
        await emit('flickvert://job-completed', { fileName: `${items.length} files`, size: items.reduce((sum, file) => sum + file.size, 0), output })
        setStatus(`${tr('Archive created')}: ${output.split(/[\\/]/).pop()}`)
      } else if (actionId === 'extract-zip') {
        const file = filesRef.current[0]
        if (!file) return
        const output = await invoke<string>('extract_zip_archive', { inputPath: file.path, destinationFolder: loadSettings().outputFolder })
        await emit('flickvert://job-completed', { fileName: file.name, size: file.size, output })
        setStatus(`${tr('Archive extracted')}: ${output.split(/[\\/]/).pop()}`)
      } else if (actionId === 'copy-to-folder' || actionId === 'move-to-folder') {
        const items = filesRef.current
        if (!items.length) return
        for (const file of items) await invoke<string>(actionId === 'copy-to-folder' ? 'copy_to_flickvert_folder' : 'move_to_flickvert_folder', { inputPath: file.path })
        setStatus(`${tr(actionId === 'copy-to-folder' ? 'Copied files' : 'Moved files')}: ${items.length}`)
      } else if (actionId === 'reveal' || actionId === 'copy-path') {
        const path = filesRef.current[0]?.path
        if (!path) return
        await invoke(actionId === 'reveal' ? 'reveal_dropped_file' : 'copy_dropped_file_path', { inputPath: path })
        setStatus(tr(actionId === 'reveal' ? 'Show in folder' : 'Path copied'))
      } else if (actionId === 'open-terminal') {
        const path = filesRef.current[0]?.path
        if (!path) return
        await invoke('open_terminal', { inputPath: path })
        setStatus(tr('Terminal opened'))
      } else {
        await invoke('quick_action', { actionId })
      }
      if (['create-zip', 'extract-zip', 'copy-to-folder', 'move-to-folder', 'reveal', 'copy-path', 'open-terminal'].includes(actionId)) window.setTimeout(hide, 650)
      else await getCurrentWindow().hide()
    } catch (error) {
      setStatus(String(error).slice(0, 120))
    }
  }

  const actions = files.length ? wheelMode === 'actions' ? fileActions : wheelMode === 'tools' ? toolActionsFor(files, ffmpegAvailable, imagemagickAvailable) : [] : []
  const choices: WheelChoice[] = wheelMode === 'convert'
    ? formats.map((format) => ({ key: format.extension, label: format.label, disabled: false, onChoose: () => void convertFiles(filesRef.current, format) }))
    : actions.map((action) => {
      const needsOneFile = ['extract-zip', 'reveal', 'copy-path', 'open-terminal'].includes(action.id)
      const imageTool = allToolActions.some((tool) => tool.id === action.id)
      const unavailableTool = imageTool && dragMode && !toolActionsFor(files, ffmpegAvailable, imagemagickAvailable).some((tool) => tool.id === action.id)
      const multipleEditorFiles = action.id === 'image-editor' && files.length !== 1
      const unavailableArchive = dragMode && (action.id === 'create-zip' ? files.length === 0 : action.id === 'extract-zip' && (files.length !== 1 || files[0]?.extension !== 'zip'))
      return { key: action.id, label: tr(action.label), glyph: action.glyph, disabled: (needsOneFile && files.length !== 1) || unavailableTool || unavailableArchive || multipleEditorFiles, onChoose: () => void choose(action.id) }
    })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { hide(); return }
      const modes = ['convert', 'tools', 'actions'] as const
      if (['1', '2', '3'].includes(event.key)) { setActiveWheelMode(modes[Number(event.key) - 1]); return }
      const count = choices.length
      if (!count || dropHandled.current) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => (value + 1) % count) }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => (value + count - 1) % count) }
      if (event.key === 'Enter' && active >= 0) {
        event.preventDefault()
        if (choices[active] && !choices[active].disabled) choices[active].onChoose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, choices])
  const emptyWheel = !files.length && !choices.length
  const activeChoice = choices[active]
  const centerTitle = status || activeChoice?.label || (files.length === 1 ? files[0].name : files.length ? `${files.length} ${tr('files')}` : tr('Drag a file here'))
  const centerDetail = status ? (files.length === 1 ? files[0].name : '') : activeChoice ? wheelMode === 'convert' ? `${tr('Convert to')} ${activeChoice.label}` : (files.length === 1 ? files[0].name : '') : files.length ? wheelMode === 'convert' ? tr('Select output format') : '' : ''
  return <main className={`quick-shell${dragMode ? ' drag-mode' : ''}${emptyWheel ? ' quick-empty' : ''}`} aria-label="FlickVert quick actions">
    <div className={`quick-orbit${emptyWheel ? ' no-choices' : ''}`} aria-label={tr(wheelMode === 'convert' ? 'Select output format' : wheelMode === 'tools' ? 'Tools' : 'Actions')}>
      <WheelChoices items={choices} active={active} onActive={setActive}/>
      <div className="quick-center" aria-live="polite"><strong>{centerTitle}</strong>{centerDetail && <small>{centerDetail}</small>}</div>
    </div>
  </main>
}
