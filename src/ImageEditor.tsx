import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { loadSettings } from './settings'
import { selectionToPixels, normalizeSelection, type Selection } from './image-editor'
import { t, type MessageKey } from './i18n'

export type ImageEditTool = 'crop' | 'redact' | 'annotate' | 'background' | 'adjust'
type Props = { inputPath: string; initialTool: ImageEditTool; onClose: () => void }
const tools: ImageEditTool[] = ['crop', 'redact', 'annotate', 'background', 'adjust']
const labels: Record<ImageEditTool, MessageKey> = { crop: 'Crop', redact: 'Redact', annotate: 'Annotate', background: 'Background', adjust: 'Adjust' }

export default function ImageEditor({ inputPath, initialTool, onClose }: Props) {
  const tr = (key: MessageKey) => t(loadSettings().language, key)
  const bitmap = useRef<ImageBitmap | null>(null)
  const dragStart = useRef<[number, number] | null>(null)
  const [url, setUrl] = useState('')
  const [tool, setTool] = useState(initialTool)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [textPosition, setTextPosition] = useState<[number, number] | null>(null)
  const [caption, setCaption] = useState('')
  const [textColor, setTextColor] = useState('#ffffff')
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let disposed = false
    let objectUrl = ''
    void invoke<number[]>('read_dropped_file', { inputPath }).then(async (bytes) => {
      const extension = inputPath.split('.').pop()?.toLowerCase()
      const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : extension === 'gif' ? 'image/gif' : extension === 'bmp' ? 'image/bmp' : 'image/png'
      const image = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: mime }))
      if (disposed) { image.close(); return }
      bitmap.current = image
      objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mime }))
      setUrl(objectUrl)
    }).catch((reason) => setError(`${tr('Could not edit image')}: ${String(reason).slice(0, 120)}`))
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', escape)
    return () => {
      disposed = true
      window.removeEventListener('keydown', escape)
      bitmap.current?.close()
      bitmap.current = null
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [inputPath])

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
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = point(event)
    setSelection(normalizeSelection(dragStart.current, dragStart.current))
  }

  function moveSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current) setSelection(normalizeSelection(dragStart.current, point(event)))
  }

  function endSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    setSelection(normalizeSelection(dragStart.current, point(event)))
    dragStart.current = null
  }

  async function save() {
    const image = bitmap.current
    if (!image || busy) return
    setError('')
    const area = tool === 'crop' || tool === 'redact' ? selection && selectionToPixels(selection, image.width, image.height) : null
    if ((tool === 'crop' || tool === 'redact') && (!area || area.width < 2 || area.height < 2)) { setError(tr('Select an area first')); return }
    if (tool === 'annotate' && !caption.trim()) { setError(tr('Enter a caption first')); return }
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = tool === 'crop' && area ? area.width : image.width
      canvas.height = tool === 'crop' && area ? area.height : image.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not create image canvas')
      if (tool === 'background') { context.fillStyle = backgroundColor; context.fillRect(0, 0, canvas.width, canvas.height) }
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
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Image export failed')), 'image/png'))
      if (blob.size > 128 * 1024 * 1024) throw new Error('Edited image exceeds the 128 MB limit')
      const stem = inputPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'image'
      const suffix: Record<ImageEditTool, string> = { crop: 'cropped', redact: 'redacted', annotate: 'annotated', background: 'background', adjust: 'edited' }
      const output = await invoke<string>('save_output', { fileName: `${stem}-${suffix[tool]}.png`, inputPath, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) })
      await emit('flickvert://job-completed', { fileName: `${stem}.png`, size: blob.size, output })
      onClose()
    } catch (reason) {
      setError(`${tr('Could not edit image')}: ${String(reason).slice(0, 120)}`)
    } finally { setBusy(false) }
  }

  const fileName = inputPath.split(/[\\/]/).pop() || inputPath
  return <div className="image-editor-backdrop">
    <section className="image-editor" role="dialog" aria-modal="true" aria-label={tr('Edit image')}>
      <header className="image-editor-header"><div><strong>{tr('Edit image')}</strong><span title={fileName}>{fileName}</span></div><button className="secondary-button" onClick={onClose} disabled={busy}>{tr('Cancel')}</button></header>
      <nav className="image-editor-tools" aria-label={tr('Edit image')}>
        {tools.map((item) => <button type="button" key={item} className={tool === item ? 'selected' : ''} onClick={() => { setTool(item); setError('') }}>{tr(labels[item])}</button>)}
      </nav>
      <div className="image-editor-body">
        <div className="image-editor-preview">
          {url ? <div className="image-editor-image" style={{ backgroundColor: tool === 'background' ? backgroundColor : undefined }} onPointerDown={startSelection} onPointerMove={moveSelection} onPointerUp={endSelection} onPointerCancel={endSelection}>
            <img src={url} alt={fileName} style={{ filter: tool === 'adjust' ? `brightness(${brightness}%) contrast(${contrast}%)` : undefined }}/>
            {selection && (tool === 'crop' || tool === 'redact') && <div className={`image-editor-selection${tool === 'redact' ? ' redact' : ''}`} style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%` }}/>} 
            {textPosition && tool === 'annotate' && <span className="image-editor-caption-marker" style={{ left: `${textPosition[0] * 100}%`, top: `${textPosition[1] * 100}%`, color: textColor }}>{caption || tr('Text')}</span>}
          </div> : <p>{tr('Loading image...')}</p>}
        </div>
        <aside className="image-editor-controls">
          {(tool === 'crop' || tool === 'redact') && <p>{tr('Drag to select an area')}</p>}
          {tool === 'annotate' && <><p>{tr('Click image to place text')}</p><label className="field"><span>{tr('Text')}</span><input value={caption} maxLength={300} onChange={(event) => setCaption(event.target.value)}/></label><label className="field"><span>{tr('Text color')}</span><input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)}/></label></>}
          {tool === 'background' && <><p>{tr('Fills transparent pixels')}</p><label className="field"><span>{tr('Background color')}</span><input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)}/></label></>}
          {tool === 'adjust' && <><label className="field"><span>{tr('Brightness')} · {brightness}%</span><input type="range" min="25" max="200" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))}/></label><label className="field"><span>{tr('Contrast')} · {contrast}%</span><input type="range" min="25" max="200" value={contrast} onChange={(event) => setContrast(Number(event.target.value))}/></label></>}
          {error && <p className="image-editor-error" role="alert">{error}</p>}
          <button className="primary-button image-editor-save" onClick={() => void save()} disabled={busy || !url}>{busy ? tr('Processing...') : tr('Apply and save')}</button>
        </aside>
      </div>
    </section>
  </div>
}
