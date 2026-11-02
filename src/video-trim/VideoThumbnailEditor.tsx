import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t, type MessageKey } from '../i18n'
import { operationErrorKind, operationErrorMessages } from '../quick-menu/operation-errors'
import { validateVideoFrameTime } from '../video-trim'

type Props = { inputPath: string; language: 'en' | 'ru' | 'zh'; outputFolder?: string; videoCodec: string; videoPreset: string; onClose: () => void }

export default function VideoThumbnailEditor({ inputPath, language, outputFolder, videoCodec, videoPreset, onClose }: Props) {
  const tr = (key: MessageKey) => t(language, key)
  const [duration, setDuration] = useState<number | null>(null)
  const [time, setTime] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const fileName = inputPath.split(/[\\/]/).pop() || inputPath
  const timeUs = duration === null ? null : validateVideoFrameTime(time, duration)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  useEffect(() => {
    let active = true
    void invoke<number>('media_duration', { inputPath }).then((value) => { if (active) setDuration(value) })
      .catch(() => { if (active) setError('Required engine unavailable') })
    return () => { active = false }
  }, [inputPath])

  async function save() {
    if (timeUs === null) return
    setBusy(true)
    setError(null)
    try {
      await invoke('process_media_tool', {
        inputPath, actionId: 'video-thumbnail', videoPreset, videoCodec,
        thumbnailTimeUs: timeUs, destinationFolder: outputFolder,
      })
      onClose()
    } catch (cause) {
      setError(operationErrorMessages[operationErrorKind(cause)])
      setBusy(false)
    }
  }

  return <div className="image-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="image-editor video-trim-editor" role="dialog" aria-modal="true" aria-labelledby="video-thumbnail-title">
      <header className="image-editor-header"><div><strong id="video-thumbnail-title">{tr('Create thumbnail')}</strong><span title={fileName}>{fileName}</span></div><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{tr('Cancel')}</button></header>
      <div className="video-trim-content">
        <p>{tr('Choose a time to capture. The thumbnail will be saved next to the video or in your selected output folder.')}</p>
        {duration === null ? <p role="status">{tr('Reading video duration...')}</p> : <div className="video-trim-fields thumbnail-time-field">
          <label>{tr('Frame time (seconds)')}<input type="number" min="0" max={(duration - 1) / 1_000_000} step="0.001" value={time} onChange={(event) => setTime(event.target.value)}/></label>
          <span>{tr('Duration')}: {(duration / 1_000_000).toFixed(3)} s</span>
        </div>}
        {duration !== null && timeUs === null && <p className="image-editor-error" role="alert">{tr('Enter a time within the video duration.')}</p>}
        {error && <p className="image-editor-error" role="alert">{tr(error)}</p>}
        <button className="primary-button image-editor-save" type="button" disabled={busy || timeUs === null} onClick={() => void save()}>{tr(busy ? 'Processing...' : 'Create thumbnail')}</button>
      </div>
    </section>
  </div>
}
