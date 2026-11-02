import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t, type MessageKey } from '../i18n'
import { operationErrorKind, operationErrorMessages } from '../quick-menu/operation-errors'
import { movePdfFile, pdfMergeOutputPath } from '../pdf-merge'

type Props = { inputPaths: string[]; language: 'en' | 'ru' | 'zh'; outputFolder?: string; onClose: () => void }

export default function PdfMergeEditor({ inputPaths, language, outputFolder, onClose }: Props) {
  const tr = (key: MessageKey) => t(language, key)
  const [paths, setPaths] = useState(inputPaths)
  const [busy, setBusy] = useState(false)
  const [savedPath, setSavedPath] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)
  const outputPath = pdfMergeOutputPath(paths, outputFolder)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  async function merge() {
    setBusy(true)
    setError(null)
    try {
      setSavedPath(await invoke<string>('merge_pdf_files', { inputPaths: paths, destinationFolder: outputFolder }))
    } catch (cause) {
      setError(operationErrorMessages[operationErrorKind(cause)])
    } finally {
      setBusy(false)
    }
  }

  return <div className="image-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="image-editor pdf-merge-editor" role="dialog" aria-modal="true" aria-labelledby="pdf-merge-title">
      <header className="image-editor-header"><div><strong id="pdf-merge-title">{tr('Merge PDFs')}</strong><span>{paths.length} {tr('files')}</span></div><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{tr(savedPath ? 'Close' : 'Cancel')}</button></header>
      <div className="pdf-merge-content">
        <p>{tr('PDF files will be joined in this order. Original files stay unchanged.')}</p>
        <ol className="pdf-merge-list">{paths.map((path, index) => <li key={`${path}:${index}`}><span className="pdf-merge-index">{index + 1}</span><span className="pdf-merge-name" title={path.split(/[\\/]/).pop()}>{path.split(/[\\/]/).pop()}</span><div><button className="icon-button" type="button" aria-label={`${tr('Move up')}: ${path.split(/[\\/]/).pop()}`} title={tr('Move up')} disabled={busy || index === 0 || Boolean(savedPath)} onClick={() => setPaths((current) => movePdfFile(current, index, -1))}>↑</button><button className="icon-button" type="button" aria-label={`${tr('Move down')}: ${path.split(/[\\/]/).pop()}`} title={tr('Move down')} disabled={busy || index === paths.length - 1 || Boolean(savedPath)} onClick={() => setPaths((current) => movePdfFile(current, index, 1))}>↓</button></div></li>)}</ol>
        <div className="pdf-merge-output"><span>{tr(savedPath ? 'Saved' : 'Expected output')}</span><code title={savedPath || outputPath}>{savedPath || outputPath}</code></div>
        {error && <p className="image-editor-error" role="alert">{tr(error)}</p>}
        {!savedPath && <button className="primary-button image-editor-save" type="button" disabled={busy || paths.length < 2} onClick={() => void merge()}>{tr(busy ? 'Processing...' : 'Merge and save')}</button>}
      </div>
    </section>
  </div>
}
