import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t, type MessageKey } from '../i18n'
import { operationErrorKind, operationErrorMessages } from '../quick-menu/operation-errors'
import { videoExportPreview, type VideoExportCodec } from '../video-export-preview'

type Props = { inputPaths: string[]; language: 'en' | 'ru' | 'zh'; outputFolder?: string; codec: VideoExportCodec; preset: string; height?: number; onClose: () => void }
const formatTime = (microseconds: number) => {
  const milliseconds = Math.floor(microseconds / 1_000)
  return `${String(Math.floor(milliseconds / 3_600_000)).padStart(2, '0')}:${String(Math.floor(milliseconds % 3_600_000 / 60_000)).padStart(2, '0')}:${String(Math.floor(milliseconds % 60_000 / 1_000)).padStart(2, '0')}.${String(milliseconds % 1_000).padStart(3, '0')}`
}

export default function VideoExportPreview({ inputPaths, language, outputFolder, codec, preset, height, onClose }: Props) {
  const tr = (key: MessageKey) => t(language, key)
  const [durations, setDurations] = useState<number[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)
  const [error, setError] = useState<MessageKey | null>(null)
  const preview = videoExportPreview(inputPaths, codec, outputFolder)

  useEffect(() => {
    let active = true
    void Promise.all(inputPaths.map((inputPath) => invoke<number>('media_duration', { inputPath })))
      .then((values) => { if (active) setDurations(values) })
      .catch((cause) => { if (active) setError(operationErrorMessages[operationErrorKind(cause)]) })
    return () => { active = false }
  }, [inputPaths])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  async function compress() {
    setBusy(true)
    setError(null)
    try {
      for (let index = completedCount; index < inputPaths.length; index += 1) {
        await invoke('process_media_tool', { inputPath: inputPaths[index], actionId: 'compress-video', videoCodec: codec, videoPreset: preset, videoHeight: height, destinationFolder: outputFolder })
        setCompletedCount(index + 1)
      }
      setComplete(true)
      setBusy(false)
    } catch (cause) {
      setError(operationErrorMessages[operationErrorKind(cause)])
      setBusy(false)
    }
  }

  return <div className="image-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="image-editor video-export-preview" role="dialog" aria-modal="true" aria-labelledby="video-export-title">
      <header className="image-editor-header"><div><strong id="video-export-title">{tr('Video export preview')}</strong><span>{inputPaths.length === 1 ? inputPaths[0].split(/[\\/]/).pop() : `${inputPaths.length} ${tr('files')}`}</span></div><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{tr(complete ? 'Close' : 'Cancel')}</button></header>
      <div className="video-export-content">
        <p>{tr('Review the output settings and destination before compression.')}</p>
        <dl className="video-export-details">
          <div><dt>{tr('Container')}</dt><dd>{preview.container}</dd></div>
          <div><dt>{tr('Codec')}</dt><dd>{preview.codec}</dd></div>
          <div><dt>{tr('Video preset')}</dt><dd>{tr(preset === 'small' ? 'Smaller file' : preset === 'high' ? 'Higher quality' : 'Balanced')}{height ? ` · ${height}p` : ''}</dd></div>
        </dl>
        {durations ? <ul className="video-export-files">{preview.files.map((file, index) => <li key={file.inputPath}><span>{file.inputPath.split(/[\\/]/).pop()}</span><small>{tr('Duration')}: {formatTime(durations[index])}</small><code title={file.outputPath}>{file.outputPath}</code></li>)}</ul> : !error && <p role="status">{tr('Preparing preview...')}</p>}
        {error && <p className="image-editor-error" role="alert">{tr(error)}</p>}
        {completedCount > 0 && !complete && <p role="status">{tr('Saved')}: {completedCount}/{inputPaths.length}</p>}
        {complete && <p role="status">{tr('Saved')}</p>}
        {!complete && <button className="primary-button image-editor-save" type="button" disabled={busy || !durations} onClick={() => void compress()}>{busy ? `${tr('Processing...')} ${completedCount + 1}/${inputPaths.length}` : tr('Compress and save')}</button>}
      </div>
    </section>
  </div>
}
