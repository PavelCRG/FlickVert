import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { MessageKey } from '../i18n'
import './batch-rename.css'

type RenamePreviewItem = { originalName: string; outputName: string; collision: boolean }

export function BatchRenameDialog({ inputPaths, tr, onClose }: {
  inputPaths: string[]
  tr: (key: MessageKey) => string
  onClose: () => void
}) {
  const [template, setTemplate] = useState('{name}-{counter}')
  const [preview, setPreview] = useState<RenamePreviewItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [renamedCount, setRenamedCount] = useState<number | null>(null)
  const signature = inputPaths.join('\0')

  useEffect(() => {
    let current = true
    setPreview(null)
    setError(null)
    if (!template.trim() || template.length > 120) return () => { current = false }
    const timer = window.setTimeout(() => {
      void invoke<RenamePreviewItem[]>('preview_batch_rename', { inputPaths, template })
        .then((items) => { if (current) setPreview(items) })
        .catch(() => { if (current) setError('Could not preview file names.') })
    }, 100)
    return () => { current = false; window.clearTimeout(timer) }
  }, [signature, template])

  async function rename() {
    if (!preview || preview.some((item) => item.collision) || busy) return
    setBusy(true)
    setError(null)
    try {
      const outputs = await invoke<string[]>('rename_batch_files', { inputPaths, template })
      setRenamedCount(outputs.length)
    } catch (reason) {
      setError(String(reason).includes('Rename target already exists') ? 'A file with that name already exists.' : 'Could not rename files.')
    } finally { setBusy(false) }
  }

  return <div className="image-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="image-editor batch-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-rename-title">
      <header className="image-editor-header"><div><strong id="batch-rename-title">{tr('Rename files')}</strong><span>{inputPaths.length}</span></div><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{tr(renamedCount === null ? 'Cancel' : 'Close')}</button></header>
      <div className="batch-rename-content">
        <label className="field"><span>{tr('Rename pattern')}</span><input autoFocus maxLength={120} value={template} disabled={renamedCount !== null} onChange={(event) => setTemplate(event.target.value)} aria-describedby="batch-rename-hint"/></label>
        <small id="batch-rename-hint">{tr('Use {name} and {counter}; the extension stays unchanged.')}</small>
        <h2>{tr('Rename preview')}</h2>
        <div className="batch-rename-list" aria-live="polite">{preview?.slice(0, 100).map((item, index) => <div key={`${item.originalName}-${index}`} className={item.collision ? 'batch-rename-row conflict' : 'batch-rename-row'}><span title={item.originalName}>{item.originalName}</span><span aria-hidden="true">→</span><strong title={item.outputName}>{item.outputName}</strong>{item.collision && <small>{tr('Name already exists')}</small>}</div>)}{preview && preview.length > 100 && <small>+{preview.length - 100}</small>}{!preview && !error && <p role="status">{tr('Previewing...')}</p>}</div>
        {error && <p className="image-editor-error" role="alert">{tr(error)}</p>}
        {renamedCount !== null && <p role="status">{tr('Renamed files')}: {renamedCount}</p>}
        <footer><button type="button" className="primary-button image-editor-save" disabled={busy || !preview || preview.some((item) => item.collision) || renamedCount !== null} onClick={() => void rename()}>{tr(busy ? 'Processing...' : 'Rename files')}</button></footer>
      </div>
    </section>
  </div>
}
