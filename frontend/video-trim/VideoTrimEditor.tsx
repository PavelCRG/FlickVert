import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t, type MessageKey } from '../i18n'
import { operationErrorKind, operationErrorMessages } from '../quick-menu/operation-errors'
import { validateVideoTrimRange } from '../video-trim'
import { videoExportPreview } from '../video-export-preview'

type Props = { inputPath: string; language: 'en' | 'ru' | 'zh'; outputFolder?: string; videoCodec: string; videoPreset: string; onClose: () => void }
type MediaStream = { kind: 'video' | 'audio' | 'subtitle'; codec?: string; language?: string; trackIndex: number }
const formatTime = (value: number) => {
  const milliseconds = Math.floor(value * 1_000)
  return `${String(Math.floor(milliseconds / 3_600_000)).padStart(2, '0')}:${String(Math.floor(milliseconds % 3_600_000 / 60_000)).padStart(2, '0')}:${String(Math.floor(milliseconds % 60_000 / 1_000)).padStart(2, '0')}.${String(milliseconds % 1_000).padStart(3, '0')}`
}

export default function VideoTrimEditor({ inputPath, language, outputFolder, videoCodec, videoPreset, onClose }: Props) {
  const tr = (key: MessageKey) => t(language, key)
  const [duration, setDuration] = useState<number | null>(null)
  const [streams, setStreams] = useState<MediaStream[]>([])
  const [streamsLoaded, setStreamsLoaded] = useState(false)
  const [videoTrack, setVideoTrack] = useState('')
  const [audioTrack, setAudioTrack] = useState('')
  const [subtitleTrack, setSubtitleTrack] = useState('')
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const fileName = inputPath.split(/[\\/]/).pop() || inputPath
  const audioStreams = streams.filter((stream) => stream.kind === 'audio')
  const videoStreams = streams.filter((stream) => stream.kind === 'video')
  const subtitleStreams = streams.filter((stream) => stream.kind === 'subtitle')
  const range = duration === null ? null : validateVideoTrimRange(start, end, duration)
  const exportPreview = videoExportPreview([inputPath], videoCodec === 'hevc' ? 'hevc' : 'h264', outputFolder, 'trimmed')
  const percent = (seconds: string) => Math.max(0, Math.min(100, Number(seconds) * 1_000_000 / (duration || 1) * 100 || 0))

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  useEffect(() => {
    let active = true
    void invoke<number>('media_duration', { inputPath }).then((value) => {
      if (!active) return
      setDuration(value)
      setEnd((value / 1_000_000).toFixed(3))
    }).catch(() => { if (active) setError('Required engine unavailable') })
    return () => { active = false }
  }, [inputPath])

  useEffect(() => {
    let active = true
    void invoke<MediaStream[]>('inspect_media_streams', { inputPath }).then((value) => {
      if (!active) return
      setStreams(value)
      setVideoTrack(String(value.find((stream) => stream.kind === 'video')?.trackIndex ?? ''))
      setAudioTrack(String(value.find((stream) => stream.kind === 'audio')?.trackIndex ?? ''))
      setStreamsLoaded(true)
    }).catch(() => { if (active) setError('Required engine unavailable') })
    return () => { active = false }
  }, [inputPath])

  async function save() {
    if (!range) return
    setBusy(true)
    setError(null)
    try {
      await invoke('process_media_tool', {
        inputPath, actionId: 'trim-video', videoPreset, videoCodec,
        videoStreamIndex: videoTrack === '' ? undefined : Number(videoTrack),
        audioStreamIndex: audioTrack === '' ? undefined : Number(audioTrack),
        subtitleStreamIndex: subtitleTrack === '' ? undefined : Number(subtitleTrack),
        trimStartUs: range.startUs, trimEndUs: range.endUs, destinationFolder: outputFolder,
      })
      onClose()
    } catch (cause) {
      setError(operationErrorMessages[operationErrorKind(cause)])
      setBusy(false)
    }
  }

  return <div className="image-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="image-editor video-trim-editor" role="dialog" aria-modal="true" aria-labelledby="video-trim-title">
      <header className="image-editor-header"><div><strong id="video-trim-title">{tr('Trim video')}</strong><span title={fileName}>{fileName}</span></div><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{tr('Cancel')}</button></header>
      <div className="video-trim-content">
        <p>{tr('Choose the section to keep. The original file will remain unchanged.')}</p>
        {duration === null ? <p role="status">{tr('Reading video duration...')}</p> : <>
          {!streamsLoaded && <p role="status">{tr('Reading video streams...')}</p>}
          <div className="video-trim-track"><span style={{ left: `${percent(start)}%`, right: `${100 - percent(end)}%` }}/></div>
          <div className="video-trim-fields">
            <label>{tr('Start time (seconds)')}<input type="number" min="0" max={duration / 1_000_000} step="0.001" value={start} onChange={(event) => setStart(event.target.value)}/></label>
            <label>{tr('End time (seconds)')}<input type="number" min="0" max={duration / 1_000_000} step="0.001" value={end} onChange={(event) => setEnd(event.target.value)}/></label>
            <span>{tr('Duration')}: {formatTime(duration / 1_000_000)}</span>
          </div>
          <div className="video-stream-options">
            <label>{tr('Video track')}<select value={videoTrack} onChange={(event) => setVideoTrack(event.target.value)} disabled={!videoStreams.length}>{!videoStreams.length && <option value="">{tr('No video track')}</option>}{videoStreams.map((stream) => <option key={stream.trackIndex} value={stream.trackIndex}>{`Video ${stream.trackIndex + 1} · ${stream.codec?.toUpperCase() ?? 'Unknown'}${stream.language ? ` · ${stream.language}` : ''}`}</option>)}</select></label>
            <label>{tr('Audio track')}<select value={audioTrack} onChange={(event) => setAudioTrack(event.target.value)} disabled={!audioStreams.length}>{!audioStreams.length && <option value="">{tr('No audio track')}</option>}{audioStreams.map((stream) => <option key={stream.trackIndex} value={stream.trackIndex}>{`Audio ${stream.trackIndex + 1} · ${stream.codec?.toUpperCase() ?? 'Unknown'}${stream.language ? ` · ${stream.language}` : ''}`}</option>)}</select></label>
            <label>{tr('Subtitle track')}<select value={subtitleTrack} onChange={(event) => setSubtitleTrack(event.target.value)}><option value="">{tr('No subtitles')}</option>{subtitleStreams.map((stream) => <option key={stream.trackIndex} value={stream.trackIndex}>{`Subtitle ${stream.trackIndex + 1} · ${stream.codec?.toUpperCase() ?? 'Unknown'}${stream.language ? ` · ${stream.language}` : ''}`}</option>)}</select></label>
          </div>
          <p className="video-stream-summary">{tr('Detected streams')}: {streams.map((stream) => `${stream.kind} ${stream.trackIndex + 1}${stream.language ? ` (${stream.language})` : ''}`).join(' · ') || tr('No media streams found')}</p>
          {range && <dl className="video-trim-export-summary"><div><dt>{tr('Container')}</dt><dd>{videoCodec === 'hevc' ? 'Matroska (.mkv)' : 'MP4 (.mp4)'}</dd></div><div><dt>{tr('Codec')}</dt><dd>{videoCodec === 'hevc' ? 'HEVC (H.265)' : 'H.264'}</dd></div><div><dt>{tr('Duration')}</dt><dd>{formatTime((range.endUs - range.startUs) / 1_000_000)}</dd></div><div className="video-trim-export-path"><dt>{tr('Expected output')}</dt><dd title={exportPreview.files[0].outputPath}>{exportPreview.files[0].outputPath}</dd></div></dl>}
          {duration !== null && !range && <p className="image-editor-error" role="alert">{tr('Enter a start and end time within the video duration.')}</p>}
        </>}
        {error && <p className="image-editor-error" role="alert">{tr(error)}</p>}
        <button className="primary-button image-editor-save" type="button" disabled={busy || !range || !streamsLoaded} onClick={() => void save()}>{tr(busy ? 'Processing...' : 'Trim and save')}</button>
      </div>
    </section>
  </div>
}
