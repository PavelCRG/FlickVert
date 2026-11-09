import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t, type MessageKey } from '../i18n'
import { operationErrorKind, operationErrorMessages } from '../quick-menu/operation-errors'
import { parsePdfPageSelection, pdfSplitOutputPaths } from '../pdf-split'

type Props = { inputPath: string; language: 'en' | 'ru' | 'zh'; outputFolder?: string; onClose: () => void }

export default function PdfSplitEditor({ inputPath, language, outputFolder, onClose }: Props) {
  const tr = (key: MessageKey) => t(language, key)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [selection, setSelection] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedPaths, setSavedPaths] = useState<string[] | null>(null)
  const [error, setError] = useState<MessageKey | null>(null)
  const fileName = inputPath.split(/[\\/]/).pop() || inputPath
  const pages = pageCount === null ? null : parsePdfPageSelection(selection, pageCount)
  const outputPaths = pages ? pdfSplitOutputPaths(inputPath, pages, outputFolder) : []
  const visibleOutputs = (savedPaths || outputPaths).slice(0, 8)

  useEffect(() => {
    let active = true
    void invoke<number>('pdf_page_count', { inputPath }).then((count) => {
      if (!active) return
      setPageCount(count)
      setSelection(`1-${count}`)
    }).catch((cause) => { if (active) setError(operationErrorMessages[operationErrorKind(cause)]) })
    return () => { active = false }
  }, [inputPath])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  async function split() {
    if (!pages) return
    setBusy(true)
    setError(null)
    try {
      setSavedPaths(await invoke<string[]>('split_pdf_pages', { inputPath, pageNumbers: pages, destinationFolder: outputFolder }))
    } catch (cause) {
      setError(operationErrorMessages[operationErrorKind(cause)])
    } finally {
      setBusy(false)
    }
  }

  return <div className="image-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="image-editor pdf-split-editor" role="dialog" aria-modal="true" aria-labelledby="pdf-split-title">
      <header className="image-editor-header"><div><strong id="pdf-split-title">{tr('Split PDF')}</strong><span title={fileName}>{fileName}</span></div><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{tr(savedPaths ? 'Close' : 'Cancel')}</button></header>
      <div className="pdf-split-content">
        {pageCount === null ? !error && <p role="status">{tr('Reading PDF pages...')}</p> : <>
          <p>{tr('PDF page count')}: {pageCount}</p>
          <label className="pdf-split-selection">{tr('Pages to extract')}<input type="text" inputMode="numeric" value={selection} disabled={busy || Boolean(savedPaths)} placeholder="1, 3-5" onChange={(event) => setSelection(event.target.value)} aria-describedby="pdf-split-hint"/></label>
          <small id="pdf-split-hint" className="pdf-split-hint">{tr('Use page numbers and inclusive ranges, for example 1, 3-5.')}</small>
          {!pages && <p className="image-editor-error" role="alert">{tr('Enter unique page numbers or ranges within the document.')}</p>}
          {pages && <div className="pdf-split-preview"><span>{tr(savedPaths ? 'Saved files' : 'Expected output')} · {(savedPaths || outputPaths).length}</span><ul>{visibleOutputs.map((path) => <li key={path} title={path}>{path.split(/[\\/]/).pop()}</li>)}</ul>{(savedPaths || outputPaths).length > visibleOutputs.length && <small>+{(savedPaths || outputPaths).length - visibleOutputs.length}</small>}</div>}
        </>}
        {error && <p className="image-editor-error" role="alert">{tr(error)}</p>}
        {savedPaths && <p role="status">{tr('Saved')}</p>}
        {!savedPaths && <button className="primary-button image-editor-save" type="button" disabled={busy || !pages} onClick={() => void split()}>{tr(busy ? 'Processing...' : 'Split pages and save')}</button>}
      </div>
    </section>
  </div>
}
