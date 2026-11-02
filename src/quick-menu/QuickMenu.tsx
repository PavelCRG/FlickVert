import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { invoke } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { convertImage, fitWithin } from '../conversion/images'
import { mapConcurrent } from '../conversion/concurrent'
import { imagesToPdf } from '../conversion/pdf'
import { accentColor, loadSettings, normalizeSettings, saveSettings } from '../settings'
import { t, type MessageKey } from '../i18n'
import { allToolActions, canRunFileAction, canRunSelectedTool, canRunWheelTool, canUseNativeImagePath, commonFormats, conversionConcurrency, fileActionsForPlatform, imageToolActions, selectedToolUnavailableReason, toolActionsFor } from './quick-actions'
import { wheelLabelPosition, wheelSectorAt, wheelSlicePath } from './radial-wheel'
import { AppIcon, type AppIconName } from '../icons/AppIcon'
import { operationErrorKind, operationErrorMessages, type OperationErrorKind } from './operation-errors'
import { conversionPreview } from './conversion-preview'
import './quick-menu.css'

type NativeFile = { path: string; name: string; size: number; extension: string; mime: string; isDirectory: boolean; hasAudio?: boolean | null }
type Format = { extension: string; label: string }
type Position = { x: number; y: number }
type WheelChoice = { key: string; label: string; glyph?: AppIconName; disabled: boolean; disabledReason?: string; onChoose: () => void }
type QueueItem = { id: string; name: string; status: 'queued' | 'processing' | 'done' | 'failed' | 'cancelled'; outputPath?: string; retryReady?: boolean; jobId?: string; progress?: number; error?: OperationErrorKind }
type ZipPreview = { entries: { path: string; size: number; directory: boolean }[]; fileCount: number; totalSize: number; conflicts: string[] }
const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
const quickWindowSize = { width: 288, height: 288 }

function outputLabel(extension: string) {
  return extension === 'jpg' ? 'JPEG' : extension.toUpperCase()
}

function publishQueue(queue: QueueItem[]) {
  void emit('flickvert://operation-queue', queue.slice(-100).map((item) => ({ ...item }))).catch(() => {})
}

function WheelChoices({ items, active, onActive }: { items: WheelChoice[]; active: number; onActive: (index: number) => void }) {
  return <>
    <svg className="quick-segments" viewBox="0 0 352 352" role="group" aria-label="Available actions">
      {items.map((item, index) => <path
        key={item.key}
        d={wheelSlicePath(index, items.length)}
        className={`quick-segment${active === index ? ' active' : ''}${item.disabled ? ' disabled' : ''}`}
        role="button"
        aria-label={item.disabledReason ? `${item.label}: ${item.disabledReason}` : item.label}
        aria-disabled={item.disabled}
        tabIndex={item.disabled ? -1 : 0}
        onPointerEnter={() => onActive(index)}
        onFocus={() => { if (!item.disabled) onActive(index) }}
        onClick={() => { if (!item.disabled) item.onChoose() }}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!item.disabled) item.onChoose() } }}
      ><title>{item.disabledReason ? `${item.label}: ${item.disabledReason}` : item.label}</title></path>)}
    </svg>
    <div className="quick-labels" aria-hidden="true">
      {items.map((item, index) => <span key={item.key} className={`quick-label${active === index ? ' active' : ''}${item.disabled ? ' disabled' : ''}`} style={wheelLabelPosition(index, items.length) as CSSProperties}>
        {item.glyph && <AppIcon name={item.glyph} className="quick-glyph"/>}
        <strong>{item.label}</strong>
      </span>)}
    </div>
  </>
}

export default function QuickMenu() {
  const [settings, setSettings] = useState(loadSettings)
  const tr = (key: MessageKey) => t(settings.language, key)
  const visibleFileActions = fileActionsForPlatform(navigator.userAgent.includes('Windows'))
  const [dragMode, setDragMode] = useState(false)
  const [wheelMode, setWheelMode] = useState<'convert' | 'tools' | 'actions'>('convert')
  const [files, setFiles] = useState<NativeFile[]>([])
  const [zipPreview, setZipPreview] = useState<ZipPreview | null>(null)
  const [selectedZipPaths, setSelectedZipPaths] = useState<string[]>([])
  const [skipExistingZip, setSkipExistingZip] = useState(false)
  const [formats, setFormats] = useState<Format[]>([])
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState('')
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false)
  const [videoCodecs, setVideoCodecs] = useState<string[]>([])
  const [audioFormats, setAudioFormats] = useState<string[]>([])
  const [imagemagickAvailable, setImagemagickAvailable] = useState(false)
  const [pdfMergeAvailable, setPdfMergeAvailable] = useState(false)
  const [pdfSplitAvailable, setPdfSplitAvailable] = useState(false)
  const [pdfEditAvailable, setPdfEditAvailable] = useState(false)
  const dragModeRef = useRef(false)
  const wheelModeRef = useRef<'convert' | 'tools' | 'actions'>('convert')
  const filesRef = useRef<NativeFile[]>([])
  const ffmpegAvailableRef = useRef(false)
  const videoCodecsRef = useRef<string[]>([])
  const videoScalingAvailableRef = useRef(false)
  const imagemagickAvailableRef = useRef(false)
  const pdfMergeAvailableRef = useRef(false)
  const pdfSplitAvailableRef = useRef(false)
  const pdfEditAvailableRef = useRef(false)
  const formatsRef = useRef<Format[]>([])
  const dropHandled = useRef(false)
  const hideTimer = useRef<number | undefined>(undefined)
  const inspectedPaths = useRef('')
  const wheelSize = useRef(quickWindowSize)
  const inspectingPaths = useRef<{ signature: string; promise: Promise<{ received: NativeFile[]; options: Format[] }> } | null>(null)
  const retryFailedRef = useRef<(() => void) | null>(null)
  const activeJobIdRef = useRef<string | null>(null)
  const cancelRequestedRef = useRef(false)
  const onJobStartedRef = useRef<((jobId: string) => void) | null>(null)

  function setDragVisible(value: boolean) {
    dragModeRef.current = value
    setDragMode(value)
  }

  function modeHasChoices(value: 'convert' | 'tools' | 'actions', files: NativeFile[], formats: Format[]) {
    if (!files.length) return true
    if (value === 'convert') return formats.length > 0
    if (value === 'tools') {
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
      return toolActionsFor(files, ffmpegAvailableRef.current, imagemagickAvailableRef.current, videoCodecsRef.current, pdfMergeAvailableRef.current, pdfSplitAvailableRef.current, pdfEditAvailableRef.current).some((action) => canRunWheelTool(action.id, files.length, totalBytes))
    }
    return visibleFileActions.some((action) => canRunFileAction(action.id, files))
  }

  function setActiveWheelMode(value: 'convert' | 'tools' | 'actions') {
    if (!modeHasChoices(value, filesRef.current, formatsRef.current)) {
      setStatus(tr(value === 'convert' ? 'No formats available' : value === 'tools' ? 'No tools available for these files.' : 'No file actions available for these files.'))
      return
    }
    wheelModeRef.current = value
    setWheelMode(value)
    setActive(-1)
    setStatus('')
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
    setZipPreview(null)
    setSelectedZipPaths([])
    setFormats([])
    setActive(-1)
    setStatus('')
    dropHandled.current = false
    void getCurrentWindow().hide()
  }

  function showActionError(error: unknown) {
    const message = String(error)
    if (message.includes('flickvert-error:')) {
      const kind = operationErrorKind(error)
      void invoke('log_operation_error', { kind }).catch(() => {})
      setStatus(tr(operationErrorMessages[kind]))
    } else setStatus(tr('Could not complete action'))
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
      filesRef.current = received
      formatsRef.current = []
      setFiles(received)
      setFormats([])
      const common = await commonFormats(received, (inputPath) => invoke<string[]>('quick_formats', { inputPath }))
      const options = common.map((extension) => ({ extension, label: outputLabel(extension) }))
      formatsRef.current = options
      setFormats(options)
      if (!modeHasChoices(wheelModeRef.current, received, options)) {
        const fallback = (['convert', 'tools', 'actions'] as const).find((mode) => modeHasChoices(mode, received, options))
        if (fallback) setActiveWheelMode(fallback)
      }
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
    const convertNative = async () => {
      const jobId = await invoke<string>('begin_operation_job')
      activeJobIdRef.current = jobId
      onJobStartedRef.current?.(jobId)
      if (cancelRequestedRef.current) void invoke('cancel_operation_job', { jobId })
      try {
        return await invoke<string>('convert_file', { inputPath: file.path, outputExtension: format.extension, quality: preferences.quality, width: preferences.width, height: preferences.height, pdfDpi: preferences.pdfDpi, destinationFolder: preferences.outputFolder, jobId })
      } finally {
        if (activeJobIdRef.current === jobId) activeJobIdRef.current = null
        await invoke('finish_operation_job', { jobId }).catch(() => {})
      }
    }
    if (canUseNativeImagePath(file.extension, format.extension, ffmpegAvailableRef.current)) {
      return convertNative()
    }
    if (imageExtensions.includes(file.extension) && (format.extension === 'pdf' || ['png', 'jpg', 'webp'].includes(format.extension))) {
      const bytes = await invoke<number[]>('read_dropped_file', { inputPath: file.path })
      const input = new File([Uint8Array.from(bytes)], file.name, { type: file.mime })
      if (format.extension === 'pdf') {
        const pdf = await imagesToPdf([input], preferences.quality, preferences.pdfPageSize, preferences.pdfPageOrientation)
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
    return convertNative()
  }

  async function convertFiles(items: NativeFile[], format: Format, previousQueue: QueueItem[] = []) {
    cancelRequestedRef.current = false
    dropHandled.current = true
    setStatus(tr('Converting...'))
    const queue: QueueItem[] = [...previousQueue, ...items.map((file, index) => ({ id: `${previousQueue.length + index}:${file.name}`, name: file.name, status: 'queued' as const }))]
    publishQueue(queue)
    try {
      const concurrency = conversionConcurrency(format.extension, items, ffmpegAvailableRef.current)
      const outputs = await mapConcurrent(items, concurrency, async (file, index) => {
        const queueIndex = previousQueue.length + index
        onJobStartedRef.current = (jobId) => {
          queue[queueIndex] = { ...queue[queueIndex], jobId }
          publishQueue(queue)
        }
        if (cancelRequestedRef.current) {
          queue[queueIndex] = { ...queue[queueIndex], status: 'cancelled' }
          publishQueue(queue)
          return null
        }
        queue[queueIndex] = { ...queue[queueIndex], status: 'processing' }
        publishQueue(queue)
        try {
          const outputPath = await convertTo(file, format)
          queue[queueIndex] = { ...queue[queueIndex], status: 'done', outputPath, jobId: undefined, progress: 100 }
          publishQueue(queue)
          return outputPath
        } catch (error) {
          queue[queueIndex] = { ...queue[queueIndex], status: cancelRequestedRef.current ? 'cancelled' : 'failed', jobId: undefined, error: cancelRequestedRef.current ? 'cancelled' : operationErrorKind(error) }
          publishQueue(queue)
          return null
        }
      }, (completed) => setStatus(`${tr('Converting...')} · ${completed}/${items.length}`))
      onJobStartedRef.current = null
      const completed = outputs.filter(Boolean).length
      if (cancelRequestedRef.current) {
        queue.forEach((item) => { if (item.status === 'queued') item.status = 'cancelled' })
        publishQueue(queue)
        retryFailedRef.current = null
        setStatus(tr('Operation cancelled'))
        dropHandled.current = false
        return
      }
      setStatus(completed === items.length ? `${tr('Saved')} · ${completed}` : `${tr('Could not convert')} · ${items.length - completed}`)
      if (completed === items.length) {
        retryFailedRef.current = null
        window.setTimeout(hide, 650)
      } else {
        const failedItems = items.filter((_, index) => queue[previousQueue.length + index].status === 'failed')
        retryFailedRef.current = () => { void convertFiles(failedItems, format, queue.filter((item) => item.status === 'done')) }
        queue.forEach((item) => { item.retryReady = true })
        publishQueue(queue)
        dropHandled.current = false
      }
    } catch {
      setStatus(tr('Check the selected file and required engine.'))
      dropHandled.current = false
    }
  }

  async function processImages(items: NativeFile[], actionId: string) {
    dropHandled.current = true
    setStatus(tr(actionId === 'resize' ? 'Resizing...' : 'Processing...'))
    let activeFile = ''
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
        for (const [index, file] of items.entries()) {
          activeFile = file.name
          setStatus(`${tr('Processing...')} · ${index + 1}/${items.length} · ${file.name}`)
          const bytes = await invoke<number[]>('read_dropped_file', { inputPath: file.path })
          inputs.push(new File([Uint8Array.from(bytes)], file.name, { type: file.mime }))
        }
        const settings = loadSettings()
        const bytes = await imagesToPdf(inputs, settings.quality, settings.pdfPageSize, settings.pdfPageOrientation)
        const name = items.length === 1 ? items[0].name.replace(/\.[^.]+$/, '') : 'images'
        await invoke<string>('save_output', { fileName: `${name}.pdf`, inputPath: items[0].path, destinationFolder: loadSettings().outputFolder, bytes: Array.from(bytes) })
        setStatus(tr('PDF created'))
        window.setTimeout(hide, 650)
        return
      }
      for (const [index, file] of items.entries()) {
        activeFile = file.name
        setStatus(`${tr(actionId === 'resize' ? 'Resizing...' : 'Processing...')} · ${index + 1}/${items.length} · ${file.name}`)
        if (!imageExtensions.includes(file.extension)) {
          const preferences = loadSettings()
          await invoke<string>('process_image_tool', { inputPath: file.path, actionId, quality: preferences.quality, width: preferences.width, height: preferences.height, destinationFolder: preferences.outputFolder })
          continue
        }
        const bytes = await invoke<number[]>('read_dropped_file', { inputPath: file.path })
        const input = new File([Uint8Array.from(bytes)], file.name, { type: file.mime })
        const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' })
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
        await invoke<string>('save_output', {
          fileName: `${file.name.replace(/\.[^.]+$/, '')}${suffix}.${extension === 'jpeg' ? 'jpg' : extension}`,
          inputPath: file.path,
          destinationFolder: loadSettings().outputFolder,
          bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
        })
      }
      setStatus(tr(actionId === 'metadata' ? 'Image metadata stripped (EXIF, GPS, IPTC, XMP, and comments).' : 'Saved'))
      window.setTimeout(hide, actionId === 'metadata' ? 1800 : 650)
    } catch (error) {
      setStatus(`${tr(operationErrorMessages[operationErrorKind(error)])}: ${activeFile || tr('Check the selected file and required engine.')}`)
      dropHandled.current = false
    }
  }

  async function runTool(actionId: string, items: NativeFile[]) {
    if (actionId === 'edit-pdf-pages') {
      dropHandled.current = true
      try {
        await invoke('open_pdf_pages_editor', { inputPath: items[0].path })
        hide()
      } catch {
        setStatus(tr('Check the selected file and required engine.'))
        dropHandled.current = false
      }
      return
    }
    if (actionId === 'split-pdf') {
      dropHandled.current = true
      try {
        await invoke('open_pdf_split_editor', { inputPath: items[0].path })
        hide()
      } catch {
        setStatus(tr('Check the selected file and required engine.'))
        dropHandled.current = false
      }
      return
    }
    if (actionId === 'merge-pdf') {
      dropHandled.current = true
      try {
        await invoke('open_pdf_merge_editor', { inputPaths: items.map((item) => item.path) })
        hide()
      } catch {
        setStatus(tr('Check the selected file and required engine.'))
        dropHandled.current = false
      }
      return
    }
    if (actionId === 'compress-video') {
      dropHandled.current = true
      try {
        await invoke('open_video_export_preview', { inputPaths: items.map((item) => item.path) })
        hide()
      } catch {
        setStatus(tr('Check the selected file and required engine.'))
        dropHandled.current = false
      }
      return
    }
    if (actionId === 'video-thumbnail') {
      if (items.length !== 1) return
      dropHandled.current = true
      try {
        await invoke('open_video_thumbnail_editor', { inputPath: items[0].path })
        hide()
      } catch {
        setStatus(tr('Check the selected file and required engine.'))
        dropHandled.current = false
      }
      return
    }
    if (actionId === 'trim-video') {
      if (items.length !== 1) return
      dropHandled.current = true
      try {
        await invoke('open_video_trim_editor', { inputPath: items[0].path })
        hide()
      } catch {
        setStatus(tr('Check the selected file and required engine.'))
        dropHandled.current = false
      }
      return
    }
    if (actionId === 'extract-zip') {
      await choose(actionId)
      return
    }
    if (imageToolActions.some((action) => action.id === actionId)) {
      await processImages(items, actionId)
      return
    }
    dropHandled.current = true
    setStatus(tr('Processing...'))
    let activeFile = ''
    try {
      for (const [index, file] of items.entries()) {
        activeFile = file.name
        setStatus(`${tr('Processing...')} · ${index + 1}/${items.length} · ${file.name}`)
        const preferences = loadSettings()
        await invoke<string>('process_media_tool', { inputPath: file.path, actionId, videoPreset: preferences.videoPreset, videoCodec: preferences.videoCodec, videoHeight: videoScalingAvailableRef.current ? preferences.videoHeight : undefined, audioTargetLufs: preferences.audioTargetLufs, audioTruePeakDb: preferences.audioTruePeakDb, audioExtractionFormat: preferences.audioExtractionFormat, destinationFolder: preferences.outputFolder })
      }
      setStatus(tr('Saved'))
      window.setTimeout(hide, 650)
    } catch (error) {
      setStatus(`${tr(operationErrorMessages[operationErrorKind(error)])}: ${activeFile || tr('Check the selected file and required engine.')}`)
      dropHandled.current = false
    }
  }

  async function dropFiles(paths: string[], point: Position) {
    try {
      const { received, options } = await refreshFiles(paths)
      if (wheelModeRef.current === 'actions') {
        const index = wheelSectorAt(point, wheelSize.current, visibleFileActions.length)
        const id = visibleFileActions[index]?.id
        if (id && canRunFileAction(id, received)) await choose(id)
        else hide()
        return
      }
      if (wheelModeRef.current === 'tools') {
        const actions = toolActionsFor(received, ffmpegAvailableRef.current, imagemagickAvailableRef.current, videoCodecsRef.current, pdfMergeAvailableRef.current, pdfSplitAvailableRef.current, pdfEditAvailableRef.current)
        const index = wheelSectorAt(point, wheelSize.current, actions.length)
        const action = actions[index]
        if (!action || !canRunWheelTool(action.id, received.length, received.reduce((sum, file) => sum + file.size, 0))) { hide(); return }
        await runTool(action.id, received)
        return
      }
      const index = wheelSectorAt(point, wheelSize.current, options.length)
      if (wheelModeRef.current === 'convert' && index >= 0 && received.length) await convertFiles(received, options[index])
      else hide()
    } catch (error) {
      showActionError(error)
    }
  }

  useEffect(() => {
    let disposed = false
    const stops: (() => void)[] = []
    const addStop = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }
    void listen<unknown>('flickvert://settings-changed', ({ payload }) => {
      const next = normalizeSettings(payload)
      setSettings(next)
      saveSettings(next)
    }).then(addStop)
    void listen('flickvert://retry-failed', () => retryFailedRef.current?.()).then(addStop)
    void listen('flickvert://cancel-operation', () => {
      cancelRequestedRef.current = true
      if (activeJobIdRef.current) void invoke('cancel_operation_job', { jobId: activeJobIdRef.current }).catch(() => {})
    }).then(addStop)
    void invoke<{ ffmpeg: boolean; imagemagick: boolean }>('engine_status').then(({ ffmpeg, imagemagick }) => { ffmpegAvailableRef.current = ffmpeg; setFfmpegAvailable(ffmpeg); imagemagickAvailableRef.current = imagemagick; setImagemagickAvailable(imagemagick) }).catch(() => {})
    void invoke<boolean>('pdf_merge_available').then((available) => { pdfMergeAvailableRef.current = available; setPdfMergeAvailable(available) }).catch(() => {})
    void invoke<boolean>('pdf_split_available').then((available) => { pdfSplitAvailableRef.current = available; setPdfSplitAvailable(available) }).catch(() => {})
    void invoke<boolean>('pdf_edit_available').then((available) => { pdfEditAvailableRef.current = available; setPdfEditAvailable(available) }).catch(() => {})
    void Promise.all([invoke<string[]>('video_codecs'), invoke<boolean>('video_scaling_available')]).then(([codecs, scaling]) => { videoCodecsRef.current = codecs; videoScalingAvailableRef.current = scaling; setVideoCodecs(codecs) }).catch(() => {})
    void invoke<string[]>('audio_formats').then(setAudioFormats).catch(() => {})

    void getCurrentWindow().onFocusChanged(({ payload }) => {
      if (!payload) {
        hideTimer.current = window.setTimeout(() => { if (!dragModeRef.current) hide() }, 150)
      } else {
        setSettings(loadSettings())
        if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
      }
    }).then(addStop)
    void listen('flickvert://drag-wheel-open', () => {
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
      setActiveWheelMode('convert')
      setDragVisible(true)
      setStatus('')
      dropHandled.current = false
      void invoke<boolean>('take_drag_trigger').catch(() => false)
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
      if (!dragModeRef.current) setActiveWheelMode('convert')
      if (payload.length) void refreshFiles(payload).catch(() => setStatus(tr('Could not open files')))
      else if (dragModeRef.current) { filesRef.current = []; formatsRef.current = []; setFiles([]); setFormats([]); setStatus(tr('No selected files found')) }
      else { filesRef.current = []; formatsRef.current = []; setFiles([]); setFormats([]); setDragVisible(false) }
    }).then(addStop)
    void listen<{ actionId: string; paths: string[] }>('flickvert://operation-shortcut', async ({ payload }) => {
      try {
        const { received } = await refreshFiles(payload.paths)
        const totalBytes = received.reduce((sum, file) => sum + file.size, 0)
        const toolIds = toolActionsFor(received, ffmpegAvailableRef.current, imagemagickAvailableRef.current, videoCodecsRef.current, pdfMergeAvailableRef.current, pdfSplitAvailableRef.current, pdfEditAvailableRef.current).map((action) => action.id)
        if (canRunSelectedTool(payload.actionId, toolIds, received.length) && canRunWheelTool(payload.actionId, received.length, totalBytes)) await runTool(payload.actionId, received)
        else if (canRunFileAction(payload.actionId, received)) await choose(payload.actionId)
        else setStatus(tr('Check the selected file and required engine.'))
      } catch { setStatus(tr('Could not open files')) }
    }).then(addStop)
    void invoke<string[]>('take_startup_files').then((paths) => {
      if (paths.length) void refreshFiles(paths).catch(() => setStatus(tr('Could not open files')))
    }).catch(() => {})
    void invoke<boolean>('take_drag_trigger').then((opened) => {
      if (opened) { setDragVisible(true); dropHandled.current = false }
    }).catch(() => {})

    void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === 'enter') {
        if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
        void getCurrentWindow().innerSize().then((size) => { wheelSize.current = size })
        setDragVisible(true)
        void refreshFiles(payload.paths).catch(() => setStatus(tr('Could not open files')))
      } else if (payload.type === 'over') {
        const actions = wheelModeRef.current === 'tools' ? toolActionsFor(filesRef.current, ffmpegAvailableRef.current, imagemagickAvailableRef.current, videoCodecsRef.current, pdfMergeAvailableRef.current, pdfSplitAvailableRef.current, pdfEditAvailableRef.current) : []
        const count = wheelModeRef.current === 'tools' ? actions.length : wheelModeRef.current === 'actions' ? visibleFileActions.length : formatsRef.current.length
        const index = wheelSectorAt(payload.position, wheelSize.current, count)
        const action = actions[index]
        const fileAction = visibleFileActions[index]
        const disabledTool = action && !canRunWheelTool(action.id, filesRef.current.length, filesRef.current.reduce((sum, file) => sum + file.size, 0))
        const disabledFileAction = wheelModeRef.current === 'actions' && (!fileAction || !canRunFileAction(fileAction.id, filesRef.current))
        setActive(disabledTool || disabledFileAction ? -1 : index)
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
        const settings = loadSettings()
        const output = await invoke<string>('create_zip_archive', { inputPaths: items.map((file) => file.path), destinationFolder: settings.outputFolder, compressionLevel: settings.zipCompressionLevel })
        setStatus(`${tr('Archive created')}: ${output.split(/[\\/]/).pop()}`)
      } else if (actionId === 'extract-zip') {
        const file = filesRef.current[0]
        if (!file) return
        const archive = await invoke<ZipPreview>('preview_zip_archive', { inputPath: file.path })
        setZipPreview(archive)
        setSelectedZipPaths(archive.entries.filter((entry) => !entry.directory).map((entry) => entry.path))
        return
      } else if (actionId === 'copy-to-folder' || actionId === 'move-to-folder') {
        const items = filesRef.current
        if (!items.length) return
        for (const file of items) await invoke<string>(actionId === 'copy-to-folder' ? 'copy_to_flickvert_folder' : 'move_to_flickvert_folder', { inputPath: file.path })
        setStatus(`${tr(actionId === 'copy-to-folder' ? 'Copied files' : 'Moved files')}: ${items.length}`)
      } else if (actionId === 'reveal' || actionId === 'copy-path' || actionId === 'copy-powershell-path') {
        const path = filesRef.current[0]?.path
        if (!path) return
        if (actionId === 'reveal') await invoke('reveal_dropped_file', { inputPath: path })
        else if (actionId === 'copy-path') await invoke('copy_dropped_file_path', { inputPath: path })
        else await invoke('copy_powershell_path', { inputPath: path })
        setStatus(tr(actionId === 'reveal' ? 'Show in folder' : actionId === 'copy-path' ? 'Path copied' : 'PowerShell path copied'))
      } else if (actionId === 'open-terminal') {
        const path = filesRef.current[0]?.path
        if (!path) return
        await invoke('open_terminal', { inputPath: path, terminalPreference: loadSettings().terminalPreference })
        setStatus(tr('Terminal opened'))
      } else {
        await invoke('quick_action', { actionId })
      }
      if (['create-zip', 'extract-zip', 'copy-to-folder', 'move-to-folder', 'reveal', 'copy-path', 'copy-powershell-path', 'open-terminal'].includes(actionId)) window.setTimeout(hide, 650)
      else await getCurrentWindow().hide()
    } catch (error) {
      showActionError(error)
    }
  }

  function toggleZipEntry(entry: ZipPreview['entries'][number], checked: boolean) {
    if (!zipPreview) return
    const prefix = `${entry.path}/`
    setSelectedZipPaths((current) => {
      if (entry.directory && checked) return [...current.filter((path) => !path.startsWith(prefix)), entry.path]
      if (entry.directory) return current.filter((path) => path !== entry.path && !path.startsWith(prefix))
      if (checked) return [...new Set([...current, entry.path])]
      const ancestors = current.filter((path) => entry.path.startsWith(`${path}/`))
      const next = current.filter((path) => path !== entry.path && !ancestors.includes(path))
      for (const ancestor of ancestors) for (const child of zipPreview.entries) if (!child.directory && child.path.startsWith(`${ancestor}/`) && child.path !== entry.path) next.push(child.path)
      return [...new Set(next)]
    })
  }

  function zipEntryChecked(entry: ZipPreview['entries'][number]) {
    if (!zipPreview) return false
    const includes = (path: string) => selectedZipPaths.some((selected) => path === selected || path.startsWith(`${selected}/`))
    if (!entry.directory) return includes(entry.path)
    if (includes(entry.path)) return true
    const files = zipPreview.entries.filter((child) => !child.directory && child.path.startsWith(`${entry.path}/`))
    return files.length > 0 && files.every((file) => includes(file.path))
  }

  async function confirmZipExtraction() {
    const file = filesRef.current[0]
    if (!file) return
    try {
      const output = await invoke<string>('extract_zip_archive', { inputPath: file.path, destinationFolder: loadSettings().outputFolder, selectedPaths: selectedZipPaths, skipExisting: skipExistingZip })
      setZipPreview(null)
      setStatus(output ? `${tr('Archive extracted')}: ${output.split(/[\\/]/).pop()}` : tr('Archive skipped because the output folder already exists.'))
      window.setTimeout(hide, 650)
    } catch (error) { showActionError(error) }
  }

  const actions = files.length ? wheelMode === 'actions' ? visibleFileActions : wheelMode === 'tools' ? toolActionsFor(files, ffmpegAvailable, imagemagickAvailable, videoCodecs, pdfMergeAvailable, pdfSplitAvailable, pdfEditAvailable) : [] : []
  const choices: WheelChoice[] = wheelMode === 'convert'
    ? formats.map((format) => ({ key: format.extension, label: format.label, disabled: false, onChoose: () => void convertFiles(filesRef.current, format) }))
    : actions.map((action) => {
      const imageTool = allToolActions.some((tool) => tool.id === action.id)
      const unavailableTool = imageTool && dragMode && !toolActionsFor(files, ffmpegAvailable, imagemagickAvailable, videoCodecs, pdfMergeAvailable, pdfSplitAvailable, pdfEditAvailable).some((tool) => tool.id === action.id)
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
      const disabledBySelection = imageTool ? !canRunWheelTool(action.id, files.length, totalBytes) : !canRunFileAction(action.id, files)
      const disabledReason = selectedToolUnavailableReason(action.id, files, settings.audioExtractionFormat, audioFormats)
      return { key: action.id, label: tr(action.id === 'open-terminal' && navigator.userAgent.includes('Windows') ? 'Open PowerShell' : action.label), glyph: action.glyph, disabled: unavailableTool || disabledBySelection || Boolean(disabledReason), disabledReason: disabledReason ? tr(disabledReason) : undefined, onChoose: () => void choose(action.id) }
    })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (zipPreview) setZipPreview(null); else hide(); return }
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
  }, [active, choices, zipPreview])
  const emptyWheel = !files.length && !choices.length
  const activeChoice = choices[active]
  const preview = activeChoice && wheelMode === 'convert' && !status
    ? conversionPreview(files, activeChoice.key, settings.outputFolder)
    : undefined
  const pdfPageExport = Boolean(preview && files.some((file) => file.extension === 'pdf') && ['jpg', 'png'].includes(activeChoice?.key ?? ''))
  const previewDestination = preview?.destination === 'Source folders' ? tr('Source folders') : preview?.destination
  const centerTitle = status || activeChoice?.label || (files.length === 1 ? files[0].name : files.length ? `${files.length} ${tr('files')}` : tr('Drag a file here'))
  const centerDetail = status ? (files.length === 1 ? files[0].name : '') : activeChoice?.disabledReason || preview?.outputName || (activeChoice ? (files.length === 1 ? files[0].name : '') : files.length ? wheelMode === 'convert' ? tr('Select output format') : '' : '')
  return <main className={`quick-shell${dragMode ? ' drag-mode' : ''}${emptyWheel ? ' quick-empty' : ''}`} data-appearance={settings.appearance} style={{ '--wheel-accent-base': accentColor(settings) } as CSSProperties} aria-label="FlickVert quick actions">
    <div className={`quick-orbit${emptyWheel ? ' no-choices' : ''}`} aria-label={tr(wheelMode === 'convert' ? 'Select output format' : wheelMode === 'tools' ? 'Tools' : 'Actions')}>
      <WheelChoices items={choices} active={active} onActive={setActive}/>
      <div className="quick-center" aria-live="polite"><strong>{centerTitle}</strong>{centerDetail && <small>{centerDetail}</small>}{pdfPageExport && <small>{tr('PDF page resolution')}: {settings.pdfDpi} DPI</small>}{preview && <small className="quick-preview-path" title={previewDestination}>{tr('Save to')}: {previewDestination}</small>}</div>
    </div>
    {zipPreview && <section className="zip-preview" role="dialog" aria-modal="true" aria-labelledby="zip-preview-title"><h2 id="zip-preview-title">{tr('Archive preview')}</h2><p>{zipPreview.fileCount} {tr('files')} · {tr('Total size')}: {zipPreview.totalSize} B · {tr('Selected items')}: {selectedZipPaths.length}</p>{zipPreview.conflicts.length > 0 && <p className="zip-conflicts" role="alert">{tr('Archive contains conflicting names; extraction is disabled.')}: {zipPreview.conflicts.join(', ')}</p>}<fieldset className="zip-conflict-choice"><legend>{tr('If the output folder already exists')}</legend><label><input type="radio" name="zip-conflict" checked={!skipExistingZip} onChange={() => setSkipExistingZip(false)}/>{tr('Extract into a safely named new folder')}</label><label><input type="radio" name="zip-conflict" checked={skipExistingZip} onChange={() => setSkipExistingZip(true)}/>{tr('Skip extraction')}</label></fieldset><div className="zip-select-actions"><button type="button" onClick={() => setSelectedZipPaths(zipPreview.entries.filter((entry) => !entry.directory).map((entry) => entry.path))}>{tr('Select all')}</button><button type="button" onClick={() => setSelectedZipPaths([])}>{tr('Clear selection')}</button></div><ul>{zipPreview.entries.map((entry, index) => <li key={`${entry.path}-${index}`}><label><input type="checkbox" checked={zipEntryChecked(entry)} onChange={(event) => toggleZipEntry(entry, event.target.checked)}/><span>{entry.directory ? '[Folder] ' : ''}{entry.path}</span></label><small>{entry.size} B</small></li>)}</ul><footer><button type="button" className="zip-cancel" onClick={() => { setZipPreview(null); setSelectedZipPaths([]) }}>{tr('Close')}</button><button type="button" className="zip-confirm" disabled={zipPreview.conflicts.length > 0 || selectedZipPaths.length === 0} onClick={() => void confirmZipExtraction()}>{tr('Extract archive')}</button></footer></section>}
  </main>
}
