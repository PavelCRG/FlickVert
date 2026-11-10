import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { imagesToPdf } from '../conversion/pdf'
import { t, type MessageKey } from '../i18n'
import { loadSettings } from '../settings'
import { operationErrorKind, operationErrorMessages } from '../quick-menu/operation-errors'
import { moveImagePage, rotateImagePage, type ImagePage } from './image-pages'

type Props = { pages: ImagePage[]; language: 'en' | 'ru' | 'zh'; outputFolder?: string; onClose: () => void }

export default function ImageToPdfEditor({ pages: initialPages, language, outputFolder, onClose }: Props) {
  const tr = (key: MessageKey) => t(language, key)
  const [pages, setPages] = useState(initialPages)
  const [busy, setBusy] = useState(false)
  const [savedPath, setSavedPath] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (pages.reduce((total, page) => total + page.size, 0) > 32 * 1024 * 1024) throw new Error('Images exceed the 32 MB limit')
      const inputs: File[] = []
      let totalBytes = 0
      for (const page of pages) {
        const bytes = await invoke<number[]>('read_dropped_file', { inputPath: page.path })
        totalBytes += bytes.length
        if (totalBytes > 32 * 1024 * 1024) throw new Error('Images exceed the 32 MB limit')
        inputs.push(new File([Uint8Array.from(bytes)], page.name, { type: page.mime }))
      }
      const settings = loadSettings()
      const bytes = await imagesToPdf(inputs, settings.quality, settings.pdfPageSize, settings.pdfPageOrientation, pages.map((page) => page.rotation))
      const fileName = `${pages[0].name.replace(/\.[^.]+$/, '') || 'images'}.pdf`
      setSavedPath(await invoke<string>('save_output', { fileName, inputPath: pages[0].path, destinationFolder: outputFolder, bytes: Array.from(bytes) }))
    } catch (cause) {
      setError(operationErrorMessages[operationErrorKind(cause)])
    } finally {
      setBusy(false)
    }
  }

  return <div className="image-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="image-editor pdf-merge-editor" role="dialog" aria-modal="true" aria-labelledby="images-pdf-title">
      <header className="image-editor-header"><div><strong id="images-pdf-title">{tr('Images to PDF')}</strong><span>{pages.length} {tr('pages')}</span></div><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{tr(savedPath ? 'Close' : 'Cancel')}</button></header>
      <div className="pdf-merge-content">
        <p>{tr('Arrange pages and rotate images before creating the PDF. Original files stay unchanged.')}</p>
        <ol className="pdf-merge-list">{pages.map((page, index) => <li key={`${page.path}:${index}`}><span className="pdf-merge-index">{index + 1}</span><span className="pdf-merge-name" title={page.name}>{page.name}</span><div>
          <button className="icon-button" type="button" aria-label={`${tr('Move up')}: ${page.name}`} title={tr('Move up')} disabled={busy || index === 0 || Boolean(savedPath)} onClick={() => setPages((current) => moveImagePage(current, index, -1))}>↑</button>
          <button className="icon-button" type="button" aria-label={`${tr('Move down')}: ${page.name}`} title={tr('Move down')} disabled={busy || index === pages.length - 1 || Boolean(savedPath)} onClick={() => setPages((current) => moveImagePage(current, index, 1))}>↓</button>
          <button className="icon-button" type="button" aria-label={`${tr('Rotate right')}: ${page.name}`} title={`${tr('Rotate right')} (${page.rotation}°)`} disabled={busy || Boolean(savedPath)} onClick={() => setPages((current) => rotateImagePage(current, index))}>↻</button>
        </div></li>)}</ol>
        {error && <p className="image-editor-error" role="alert">{tr(error)}</p>}
        {savedPath && <div className="pdf-merge-output"><span>{tr('Saved')}</span><code title={savedPath}>{savedPath}</code></div>}
        {!savedPath && <button className="primary-button image-editor-save" type="button" disabled={busy || pages.length === 0} onClick={() => void save()}>{tr(busy ? 'Processing...' : 'Create PDF')}</button>}
      </div>
    </section>
  </div>
}
