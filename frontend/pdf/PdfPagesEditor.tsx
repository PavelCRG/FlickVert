import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t, type MessageKey } from '../i18n'
import { operationErrorKind, operationErrorMessages } from '../quick-menu/operation-errors'
import { movePdfPage, pdfPagesOutputPath, rotatePdfPage, validPdfPageOrder } from './pages'

type Props = { inputPath: string; language: 'en' | 'ru' | 'zh'; outputFolder?: string; onClose: () => void }

export default function PdfPagesEditor({ inputPath, language, outputFolder, onClose }: Props) {
  const tr = (key: MessageKey) => t(language, key)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [pageOrder, setPageOrder] = useState<number[]>([])
  const [rotations, setRotations] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [savedPath, setSavedPath] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)
  const fileName = inputPath.split(/[\\/]/).pop() || inputPath
  const outputPath = pdfPagesOutputPath(inputPath, outputFolder)

  useEffect(() => {
    let active = true
    void invoke<number>('pdf_edit_page_count', { inputPath }).then((count) => {
      if (!active) return
      setPageCount(count)
      setPageOrder(Array.from({ length: count }, (_, index) => index + 1))
      setRotations(Array.from({ length: count }, () => 0))
    }).catch((cause) => { if (active) setError(operationErrorMessages[operationErrorKind(cause)]) })
    return () => { active = false }
  }, [inputPath])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  async function save() {
    if (!pageCount || !validPdfPageOrder(pageOrder, pageCount)) return
    setBusy(true)
    setError(null)
    try {
      setSavedPath(await invoke<string>('edit_pdf_pages', { inputPath, pageOrder, rotations, destinationFolder: outputFolder }))
    } catch (cause) {
      setError(operationErrorMessages[operationErrorKind(cause)])
    } finally {
      setBusy(false)
    }
  }

  return <div className="image-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="image-editor pdf-pages-editor" role="dialog" aria-modal="true" aria-labelledby="pdf-pages-title">
      <header className="image-editor-header"><div><strong id="pdf-pages-title">{tr('Arrange PDF pages')}</strong><span title={fileName}>{fileName}</span></div><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{tr(savedPath ? 'Close' : 'Cancel')}</button></header>
      <div className="pdf-pages-content">
        {pageCount === null ? !error && <p role="status">{tr('Reading PDF pages...')}</p> : <>
          <p>{tr('Arrange pages and rotate selected pages. The original PDF stays unchanged.')}</p>
          <p>{tr('PDF page count')}: {pageCount}</p>
          <ol className="pdf-pages-list">{pageOrder.map((page, index) => <li key={page}>
            <span className="pdf-merge-index">{index + 1}</span>
            <span className="pdf-pages-name">{tr('Page')} {page}</span>
            <span className="pdf-pages-rotation" title={tr('Page rotation')}>{rotations[page - 1]}°</span>
            <div className="pdf-pages-actions">
              <button className="icon-button" type="button" aria-label={`${tr('Move up')}: ${tr('Page')} ${page}`} title={tr('Move up')} disabled={busy || Boolean(savedPath) || index === 0} onClick={() => setPageOrder((current) => movePdfPage(current, index, -1))}>↑</button>
              <button className="icon-button" type="button" aria-label={`${tr('Move down')}: ${tr('Page')} ${page}`} title={tr('Move down')} disabled={busy || Boolean(savedPath) || index === pageOrder.length - 1} onClick={() => setPageOrder((current) => movePdfPage(current, index, 1))}>↓</button>
              <button className="icon-button" type="button" aria-label={`${tr('Rotate left')}: ${tr('Page')} ${page}`} title={tr('Rotate left')} disabled={busy || Boolean(savedPath)} onClick={() => setRotations((current) => rotatePdfPage(current, page - 1, -1))}>↶</button>
              <button className="icon-button" type="button" aria-label={`${tr('Rotate right')}: ${tr('Page')} ${page}`} title={tr('Rotate right')} disabled={busy || Boolean(savedPath)} onClick={() => setRotations((current) => rotatePdfPage(current, page - 1, 1))}>↻</button>
            </div>
          </li>)}</ol>
          <div className="pdf-merge-output"><span>{tr(savedPath ? 'Saved' : 'Expected output')}</span><code title={savedPath || outputPath}>{savedPath || outputPath}</code></div>
        </>}
        {error && <p className="image-editor-error" role="alert">{tr(error)}</p>}
        {savedPath && <p role="status">{tr('Saved')}</p>}
        {!savedPath && <button className="primary-button image-editor-save" type="button" disabled={busy || !pageCount || !validPdfPageOrder(pageOrder, pageCount)} onClick={() => void save()}>{tr(busy ? 'Processing...' : 'Save edited PDF')}</button>}
      </div>
    </section>
  </div>
}
