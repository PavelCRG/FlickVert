import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { loadSettings } from '../settings'
import { pixelAspectRatio, selectionToPixels, normalizeSelection, normalizeSelectionWithAspect, type Selection } from './image-editor'
import { checkpointDraft, redoDraft, undoDraft, type DraftHistory } from './draft-history'
import { editorOutputExtension, encodeImage, formatImageSize, type CompressionFormat } from './image-compression'
import { t, type MessageKey } from '../i18n'

export type ImageEditTool = 'crop' | 'redact' | 'annotate' | 'background' | 'adjust' | 'compress'
type Props = { inputPath: string; initialTool: ImageEditTool; outputFolder?: string; onClose: () => void }
const tools: ImageEditTool[] = ['crop', 'redact', 'annotate', 'background', 'adjust', 'compress']
const labels: Record<ImageEditTool, MessageKey> = { crop: 'Crop', redact: 'Redact', annotate: 'Annotate', background: 'Background', adjust: 'Adjust', compress: 'Compress' }
const cropAspects = [{ label: 'Free', value: 0 }, { label: 'Square', value: 1 }, { label: '4:3', value: 4 / 3 }, { label: '3:2', value: 3 / 2 }, { label: '16:9', value: 16 / 9 }] as const
type EditorDraft = { tool: ImageEditTool; selection: Selection | null; cropAspect: number; textPosition: [number, number] | null; caption: string; textColor: string; backgroundColor: string; brightness: number; contrast: number; compressionFormat: CompressionFormat; compressionQuality: number }

export default function ImageEditor({ inputPath, initialTool, outputFolder, onClose }: Props) {
  const tr = (key: MessageKey) => t(loadSettings().language, key)
  const bitmap = useRef<ImageBitmap | null>(null)
  const dragStart = useRef<[number, number] | null>(null)
  const draftHistory = useRef<DraftHistory<EditorDraft>>({ past: [], future: [] })
  const draftTransaction = useRef(false)
  const draftRef = useRef<EditorDraft | null>(null)
  const busyRef = useRef(false)
  const closeRef = useRef(onClose)
  const [url, setUrl] = useState('')
  const [originalSize, setOriginalSize] = useState(0)
  const [compressionPreview, setCompressionPreview] = useState<{ url: string; blob: Blob; format: CompressionFormat; quality: number; backgroundColor: string } | null>(null)
  const [draft, setDraft] = useState<EditorDraft>(() => {
    const preferences = loadSettings()
    return { tool: initialTool, selection: null, cropAspect: 0, textPosition: null, caption: '', textColor: '#ffffff', backgroundColor: '#ffffff', brightness: 100, contrast: 100, compressionFormat: preferences.format === 'image/png' || preferences.format === 'image/jpeg' ? preferences.format : 'image/webp', compressionQuality: preferences.quality }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  draftRef.current = draft
  closeRef.current = onClose
  const { tool, selection, cropAspect, textPosition, caption, textColor, backgroundColor, brightness, contrast, compressionFormat, compressionQuality } = draft
  const cropPixels = tool === 'crop' && selection && bitmap.current
    ? selectionToPixels(selection, bitmap.current.width, bitmap.current.height)
    : null

  function beginDraftTransaction() {
    if (draftTransaction.current || !draftRef.current) return
    draftHistory.current = checkpointDraft(draftHistory.current, draftRef.current)
    draftTransaction.current = true
  }

  function updateDraft(patch: Partial<EditorDraft>) {
    const current = draftRef.current
    if (!current) return
    if (Object.entries(patch).every(([key, value]) => current[key as keyof EditorDraft] === value)) return
    if (!draftTransaction.current) draftHistory.current = checkpointDraft(draftHistory.current, current)
    const next = { ...current, ...patch }
    draftRef.current = next
    setDraft(next)
  }

  function finishDraftTransaction() {
    draftTransaction.current = false
  }

  function stepDraft(direction: 'undo' | 'redo') {
    const current = draftRef.current
    if (!current) return
    finishDraftTransaction()
    const step = direction === 'undo'
      ? undoDraft(draftHistory.current, current)
      : redoDraft(draftHistory.current, current)
    if (!step) return
    draftHistory.current = step.history
    draftRef.current = step.current
    setDraft(step.current)
  }

  const setTool = (value: ImageEditTool) => updateDraft({ tool: value })
  const setSelection = (value: Selection | null) => updateDraft({ selection: value })
  const setCropAspect = (value: number) => updateDraft({ cropAspect: value, selection: null })
  const setTextPosition = (value: [number, number] | null) => updateDraft({ textPosition: value })
  const setCaption = (value: string) => updateDraft({ caption: value })
  const setTextColor = (value: string) => updateDraft({ textColor: value })
  const setBackgroundColor = (value: string) => updateDraft({ backgroundColor: value })
  const setBrightness = (value: number) => updateDraft({ brightness: value })
  const setContrast = (value: number) => updateDraft({ contrast: value })

  useEffect(() => {
    let disposed = false
    let objectUrl = ''
    void invoke<number[]>('read_dropped_file', { inputPath }).then(async (bytes) => {
      const extension = inputPath.split('.').pop()?.toLowerCase()
      const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : extension === 'gif' ? 'image/gif' : extension === 'bmp' ? 'image/bmp' : 'image/png'
      const image = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: mime }), { imageOrientation: 'from-image' })
      if (disposed) { image.close(); return }
      bitmap.current = image
      setOriginalSize(bytes.length)
      objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mime }))
      setUrl(objectUrl)
    }).catch((reason) => setError(`${tr('Could not edit image')}: ${String(reason).slice(0, 120)}`))
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current()
      if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase())) return
      if (event.target instanceof HTMLElement && event.target.matches('input:not([type="range"]):not([type="color"]), textarea')) return
      event.preventDefault()
      if (event.key.toLowerCase() === 'y' || event.shiftKey) stepDraft('redo')
      else stepDraft('undo')
    }
    window.addEventListener('keydown', keyboard)
    return () => {
      disposed = true
      window.removeEventListener('keydown', keyboard)
      bitmap.current?.close()
      bitmap.current = null
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [inputPath])

  useEffect(() => {
    const image = bitmap.current
    if (tool !== 'compress' || !image) { setCompressionPreview(null); return }
    setError('')
    let active = true
    let previewUrl = ''
    setCompressionPreview(null)
    const timer = window.setTimeout(() => {
      void encodeImage(image, compressionFormat, compressionQuality, backgroundColor).then((blob) => {
        if (!active) return
        previewUrl = URL.createObjectURL(blob)
        setCompressionPreview({ url: previewUrl, blob, format: compressionFormat, quality: compressionQuality, backgroundColor })
      }).catch((reason) => {
        if (active) setError(`${tr('Could not edit image')}: ${String(reason).slice(0, 120)}`)
      })
    }, 220)
    return () => {
      active = false
      window.clearTimeout(timer)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [tool, compressionFormat, compressionQuality, backgroundColor, url])

  function point(event: React.PointerEvent<HTMLDivElement>): [number, number] {
    const bounds = event.currentTarget.getBoundingClientRect()
    return [(event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height]
  }

  function startSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (tool === 'annotate') {
      setTextPosition(point(event))
      return
    }
    if (tool !== 'crop' && tool !== 'redact') return
    beginDraftTransaction()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = point(event)
    setSelection(normalizeSelection(dragStart.current, dragStart.current))
  }

  function moveSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    const end = point(event)
    setSelection(tool === 'crop' && cropAspect && bitmap.current
      ? normalizeSelectionWithAspect(dragStart.current, end, bitmap.current.width / bitmap.current.height, cropAspect)
      : normalizeSelection(dragStart.current, end))
  }

  function endSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    const end = point(event)
    setSelection(tool === 'crop' && cropAspect && bitmap.current
      ? normalizeSelectionWithAspect(dragStart.current, end, bitmap.current.width / bitmap.current.height, cropAspect)
      : normalizeSelection(dragStart.current, end))
    dragStart.current = null
    finishDraftTransaction()
  }

  async function save() {
    const image = bitmap.current
    if (!image || busy) return
    const previewBlob = compressionPreview?.format === compressionFormat && compressionPreview.quality === compressionQuality && compressionPreview.backgroundColor === backgroundColor ? compressionPreview.blob : null
    if (tool === 'compress' && !previewBlob) { setError(tr('Preparing preview...')); return }
    setError('')
    const area = tool === 'crop' || tool === 'redact' ? selection && selectionToPixels(selection, image.width, image.height) : null
    if ((tool === 'crop' || tool === 'redact') && (!area || area.width < 2 || area.height < 2)) { setError(tr('Select an area first')); return }
    if (tool === 'annotate' && !caption.trim()) { setError(tr('Enter a caption first')); return }
    setBusy(true)
    busyRef.current = true
    try {
      let blob: Blob
      if (tool === 'compress') {
        blob = previewBlob!
      } else {
        const canvas = document.createElement('canvas')
        canvas.width = tool === 'crop' && area ? area.width : image.width
        canvas.height = tool === 'crop' && area ? area.height : image.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not create image canvas')
        if (tool === 'background' || compressionFormat === 'image/jpeg') { context.fillStyle = backgroundColor; context.fillRect(0, 0, canvas.width, canvas.height) }
        if (tool === 'adjust') context.filter = `brightness(${brightness}%) contrast(${contrast}%)`
        if (tool === 'crop' && area) context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
        else context.drawImage(image, 0, 0)
        context.filter = 'none'
        if (tool === 'redact' && area) { context.fillStyle = '#000'; context.fillRect(area.x, area.y, area.width, area.height) }
        if (tool === 'annotate' && textPosition) {
          const size = Math.max(18, Math.round(image.width * 0.035))
          context.font = `600 ${size}px system-ui, sans-serif`
          context.textBaseline = 'top'
          context.lineWidth = Math.max(3, size * 0.16)
          context.strokeStyle = '#0009'
          context.fillStyle = textColor
          const x = textPosition[0] * image.width
          const y = textPosition[1] * image.height
          context.strokeText(caption.trim().slice(0, 300), x, y, image.width - x)
          context.fillText(caption.trim().slice(0, 300), x, y, image.width - x)
        }
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result?.type === compressionFormat ? resolve(result) : reject(new Error('This image format is not supported')), compressionFormat, compressionQuality / 100))
      }
      if (blob.size > 128 * 1024 * 1024) throw new Error('Edited image exceeds the 128 MB limit')
      const stem = inputPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'image'
      const suffix: Record<ImageEditTool, string> = { crop: 'cropped', redact: 'redacted', annotate: 'annotated', background: 'background', adjust: 'edited', compress: 'compressed' }
      const extension = editorOutputExtension(compressionFormat)
      await invoke<string>('save_output', { fileName: `${stem}-${suffix[tool]}.${extension}`, inputPath, destinationFolder: outputFolder, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) })
      onClose()
    } catch (reason) {
      setError(`${tr('Could not edit image')}: ${String(reason).slice(0, 120)}`)
    } finally { busyRef.current = false; setBusy(false) }
  }

  const fileName = inputPath.split(/[\\/]/).pop() || inputPath
  const currentCompressionPreview = compressionPreview?.format === compressionFormat && compressionPreview.quality === compressionQuality && compressionPreview.backgroundColor === backgroundColor ? compressionPreview : null
  return <div className="image-editor-backdrop">
    <section className="image-editor" role="dialog" aria-modal="true" aria-label={tr('Edit image')}>
      <header className="image-editor-header"><div><strong>{tr('Edit image')}</strong><span title={fileName}>{fileName}</span></div><div className="image-editor-history"><button className="secondary-button" onClick={() => stepDraft('undo')} disabled={busy || !draftHistory.current.past.length}>{tr('Undo')}</button><button className="secondary-button" onClick={() => stepDraft('redo')} disabled={busy || !draftHistory.current.future.length}>{tr('Redo')}</button><button className="secondary-button" onClick={onClose} disabled={busy}>{tr('Cancel')}</button></div></header>
      <nav className="image-editor-tools" aria-label={tr('Edit image')}>
        {tools.map((item) => <button type="button" key={item} className={tool === item ? 'selected' : ''} onClick={() => { setTool(item); setError('') }}>{tr(labels[item])}</button>)}
      </nav>
      <div className="image-editor-body">
        <div className="image-editor-preview">
          {!url ? <p>{tr('Loading image...')}</p> : tool === 'compress' ? <div className="compression-comparison" aria-live="polite">
            <figure><figcaption>{tr('Original')} · {formatImageSize(originalSize)}</figcaption><img src={url} alt={`${tr('Original')}: ${fileName}`}/></figure>
            <figure><figcaption>{tr('Compressed preview')} · {currentCompressionPreview ? formatImageSize(currentCompressionPreview.blob.size) : tr('Preparing preview...')}</figcaption>{currentCompressionPreview ? <img src={currentCompressionPreview.url} alt={tr('Compressed preview')}/> : <div className="compression-preview-loading">{tr('Preparing preview...')}</div>}</figure>
          </div> : <div className="image-editor-image" style={{ backgroundColor: tool === 'background' ? backgroundColor : undefined }} onPointerDown={startSelection} onPointerMove={moveSelection} onPointerUp={endSelection} onPointerCancel={endSelection}>
            <img src={url} alt={fileName} style={{ filter: tool === 'adjust' ? `brightness(${brightness}%) contrast(${contrast}%)` : undefined }}/>
            {selection && (tool === 'crop' || tool === 'redact') && <div className={`image-editor-selection${tool === 'redact' ? ' redact' : ''}`} style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%` }}/>} 
            {textPosition && tool === 'annotate' && <span className="image-editor-caption-marker" style={{ left: `${textPosition[0] * 100}%`, top: `${textPosition[1] * 100}%`, color: textColor }}>{caption || tr('Text')}</span>}
          </div>}
        </div>
        <aside className="image-editor-controls">
          {tool === 'crop' && <><p>{tr('Drag to select an area')}</p><label className="field"><span>{tr('Aspect ratio')}</span><select value={cropAspect} onChange={(event) => setCropAspect(Number(event.target.value))}>{cropAspects.map((aspect) => <option key={aspect.label} value={aspect.value}>{aspect.value ? aspect.label : tr('Free')}</option>)}</select></label>{cropPixels && <output className="image-dimensions" aria-live="polite"><span>{tr('Output dimensions')}</span><strong>{cropPixels.width} × {cropPixels.height} px</strong><small>{tr('Aspect ratio')}: {pixelAspectRatio(cropPixels.width, cropPixels.height)}</small></output>}</>}
          {tool === 'redact' && <p>{tr('Drag to select an area')}</p>}
          {tool === 'annotate' && <><p>{tr('Click image to place text')}</p><label className="field"><span>{tr('Text')}</span><input value={caption} maxLength={300} onChange={(event) => setCaption(event.target.value)}/></label><label className="field"><span>{tr('Text color')}</span><input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)}/></label></>}
          {tool === 'background' && <><p>{tr('Fills transparent pixels')}</p><label className="field"><span>{tr('Background color')}</span><input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)}/></label></>}
          {tool === 'adjust' && <><label className="field"><span>{tr('Brightness')} · {brightness}%</span><input type="range" min="25" max="200" value={brightness} onPointerDown={beginDraftTransaction} onPointerUp={finishDraftTransaction} onPointerCancel={finishDraftTransaction} onChange={(event) => setBrightness(Number(event.target.value))}/></label><label className="field"><span>{tr('Contrast')} · {contrast}%</span><input type="range" min="25" max="200" value={contrast} onPointerDown={beginDraftTransaction} onPointerUp={finishDraftTransaction} onPointerCancel={finishDraftTransaction} onChange={(event) => setContrast(Number(event.target.value))}/></label></>}
          {tool === 'compress' && <><p>{tr('Compare the original with the encoded output before saving.')}</p><label className="field"><span>{tr('Format')}</span><select value={compressionFormat} onChange={(event) => updateDraft({ compressionFormat: event.target.value as CompressionFormat })}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></label>{compressionFormat === 'image/jpeg' && <label className="field"><span>{tr('JPEG background')}</span><input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)}/></label>}{compressionFormat !== 'image/png' && <label className="field"><span>{tr('Quality')} · {compressionQuality}%</span><input type="range" min="40" max="100" value={compressionQuality} onPointerDown={beginDraftTransaction} onPointerUp={finishDraftTransaction} onPointerCancel={finishDraftTransaction} onChange={(event) => updateDraft({ compressionQuality: Number(event.target.value) })}/></label>}{currentCompressionPreview && <output className="image-dimensions"><span>{tr('Original size')}</span><strong>{formatImageSize(originalSize)}</strong><small>{tr('Output size')}: {formatImageSize(currentCompressionPreview.blob.size)}</small></output>}</>}
          {tool !== 'compress' && <><label className="field"><span>{tr('Format')}</span><select value={compressionFormat} onChange={(event) => updateDraft({ compressionFormat: event.target.value as CompressionFormat })}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></label>{compressionFormat === 'image/jpeg' && tool !== 'background' && <label className="field"><span>{tr('JPEG background')}</span><input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)}/></label>}{compressionFormat !== 'image/png' && <label className="field"><span>{tr('Quality')} · {compressionQuality}%</span><input type="range" min="40" max="100" value={compressionQuality} onPointerDown={beginDraftTransaction} onPointerUp={finishDraftTransaction} onPointerCancel={finishDraftTransaction} onChange={(event) => updateDraft({ compressionQuality: Number(event.target.value) })}/></label>}</>}
          {error && <p className="image-editor-error" role="alert">{error}</p>}
          <button className="primary-button image-editor-save" onClick={() => void save()} disabled={busy || !url || tool === 'compress' && !currentCompressionPreview}>{busy ? tr('Processing...') : tr(tool === 'compress' && compressionFormat !== 'image/png' ? 'Compress and save' : 'Apply and save')}</button>
        </aside>
      </div>
    </section>
  </div>
}
