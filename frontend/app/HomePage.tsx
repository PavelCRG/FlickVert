import { emit } from '@tauri-apps/api/event'
import { AppIcon } from '../icons/AppIcon'
import { operationErrorMessages } from '../quick-menu/operation-errors'
import type { MessageKey } from '../i18n'
import type { AppSettings } from '../settings'
import type { OperationQueueItem } from './types'
import { operationShortcutActions } from '../quick-menu/quick-actions'
import { formatBytes, type ConversionHistoryEntry } from './conversion-history'

export function HomePage({ preferences, favorites, history, spaceSaved, queue, setQueue, pickError, resultOpenError, setResultOpenError, tr, onChooseFiles, onExploreTools, onOpenFavorite, onRerunHistory, onOpenCategory, onOpenKeyboard, onRevealOutput }: {
  preferences: AppSettings
  favorites: string[]
  history: ConversionHistoryEntry[]
  spaceSaved: number
  queue: OperationQueueItem[]
  setQueue: (queue: OperationQueueItem[]) => void
  pickError: boolean
  resultOpenError: boolean
  setResultOpenError: (error: boolean) => void
  tr: (key: MessageKey) => string
  onChooseFiles: () => void
  onExploreTools: () => void
  onOpenFavorite: (actionId: string) => void
  onRerunHistory: (format: string) => void
  onOpenCategory: (category: string) => void
  onOpenKeyboard: () => void
  onRevealOutput: (path: string) => void
}) {
  return <div className="page dashboard-page">
    <header className="settings-header"><div><h1>{tr('Home')}</h1><p className="subtitle">{tr('The file tools you need, right where you work.')}</p></div><button className="primary-button choose-files-button" onClick={onChooseFiles}><AppIcon name="file-plus"/>{tr('Choose files')}</button></header>
    {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}
    {favorites.length > 0 && <section className="dashboard-favorites" aria-labelledby="dashboard-favorites-title"><h2 id="dashboard-favorites-title">{tr('Favorites')}</h2><div>{operationShortcutActions.filter((action) => favorites.includes(action.id)).slice(0, 8).map((action) => <button key={action.id} type="button" className="dashboard-favorite" onClick={() => onOpenFavorite(action.id)}><AppIcon name={action.glyph}/><span>{tr(action.label)}</span><AppIcon name="arrow-right"/></button>)}</div></section>}
    {spaceSaved > 0 && <section className="dashboard-savings" aria-label={tr('Space saved')}><AppIcon name="compress"/><span>{tr('Space saved')}</span><strong>{formatBytes(spaceSaved, preferences.language === 'zh' ? 'zh-CN' : preferences.language)}</strong></section>}
    <section className="dashboard-start"><div><span className="dashboard-icon"><AppIcon name="convert"/></span><div><h2>{tr('Convert files')}</h2><p>{tr('Drop a file on the quick wheel or choose files to start.')}</p></div></div><button className="secondary-button" onClick={onExploreTools}><AppIcon name="tools"/>{tr('Explore tools')}</button></section>
    <section className="dashboard-grid" aria-label={tr('Tools & formats')}>
      <button className="dashboard-card" onClick={() => onOpenCategory('image-tools')}><span className="dashboard-card-icon"><AppIcon name="image"/></span><strong>{tr('Images and PDFs')}</strong><small>PNG · JPEG · WebP · SVG · PDF</small><AppIcon name="arrow-right" className="dashboard-card-arrow"/></button>
      <button className="dashboard-card" onClick={() => onOpenCategory('document-tools')}><span className="dashboard-card-icon"><AppIcon name="document"/></span><strong>{tr('Documents')}</strong><small>DOCX · ODT · Markdown · HTML · EPUB</small><AppIcon name="arrow-right" className="dashboard-card-arrow"/></button>
      <button className="dashboard-card" onClick={() => onOpenCategory('video-tools')}><span className="dashboard-card-icon"><AppIcon name="audio"/></span><strong>{tr('Audio and video')}</strong><small>MP3 · WAV · MP4 · MOV · WebM · SRT</small><AppIcon name="arrow-right" className="dashboard-card-arrow"/></button>
      <button className="dashboard-card" onClick={() => onOpenCategory('file-tools')}><span className="dashboard-card-icon"><AppIcon name="archive"/></span><strong>{tr('Files and archives')}</strong><small>ZIP · TAR · GZIP · CSV · TSV</small><AppIcon name="arrow-right" className="dashboard-card-arrow"/></button>
    </section>
    {queue.length > 0 && <section className="settings-group operation-queue">
      <div className="queue-header"><h2>{tr('File queue')}</h2><div className="queue-actions">{queue.some((item) => item.status === 'processing') && <button className="text-button" onClick={() => void emit('flickvert://cancel-operation')}>{tr('Cancel operation')}</button>}{queue.some((item) => item.status === 'failed' && item.retryReady) && <button className="text-button" onClick={() => void emit('flickvert://retry-failed')}>{tr('Retry failed')}</button>}<button className="text-button" disabled={queue.some((item) => item.status === 'queued' || item.status === 'processing')} onClick={() => setQueue([])}>{tr('Clear queue')}</button></div></div>
      {resultOpenError && <p className="shortcut-error" role="alert">{tr('Could not open result')}</p>}
      <div className="history-list">{queue.map((item) => <div className="file-row" key={item.id}>
        <span className={`file-icon queue-${item.status}`} aria-hidden="true">{item.status === 'done' ? <AppIcon name="check"/> : item.status === 'failed' ? <AppIcon name="alert"/> : item.status === 'processing' ? <AppIcon name="refresh"/> : <AppIcon name="document"/>}</span>
        <div className="file-info"><strong title={item.name}>{item.name}</strong>{item.outputPath && <span title={item.outputPath}>{item.outputPath}</span>}{item.status === 'processing' && item.progress !== undefined && <progress className="queue-progress" aria-label={tr('Processing...')} max={100} value={item.progress}/>}</div>
        <small className={`queue-status queue-${item.status}`}>{item.status === 'processing' && item.progress !== undefined ? `${item.progress}%` : tr(item.status === 'queued' ? 'Ready to convert' : item.status === 'processing' ? 'Processing...' : item.status === 'done' ? 'Done' : item.status === 'cancelled' ? 'Cancelled' : item.error ? operationErrorMessages[item.error] : 'Could not convert')}</small>
        {item.outputPath && <button className="queue-open-button" type="button" aria-label={`${tr('Show in folder')}: ${item.name}`} title={tr('Show in folder')} onClick={() => { setResultOpenError(false); onRevealOutput(item.outputPath!) }}><AppIcon name="folder"/></button>}
      </div>)}</div>
    </section>}
    {history.length > 0 && <section className="settings-group operation-history"><div className="queue-header"><h2>{tr('Recent conversions')}</h2></div><div className="history-list">{history.slice(0, 5).map((item) => <div className="file-row" key={item.id}><span className="file-icon queue-done"><AppIcon name="check"/></span><div className="file-info"><strong title={item.name}>{item.name}</strong><span>{item.format.toUpperCase()} · {formatBytes(item.outputBytes, preferences.language)}</span></div><button type="button" className="text-button" onClick={() => onRerunHistory(item.format)}>{tr('Convert again')}</button>{item.outputPath && <button className="queue-open-button" type="button" aria-label={`${tr('Show in folder')}: ${item.name}`} title={tr('Show in folder')} onClick={() => { setResultOpenError(false); onRevealOutput(item.outputPath!) }}><AppIcon name="folder"/></button>}</div>)}</div></section>}
    <button className="dashboard-shortcut" onClick={onOpenKeyboard}><AppIcon name="keyboard"/><span>{tr('Quick shortcut')}</span><kbd>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : key === 'SPACE' ? 'Space' : key).join(' + ')}</kbd><span>{tr('Change shortcut')} <AppIcon name="arrow-right"/></span></button>
    <section className="dashboard-ready"><span className="dashboard-ready-icon"><AppIcon name="check"/></span><div><h2>{tr('Everyday conversions are built in')}</h2><p>{tr('Images, PDFs, text and spreadsheets work without extra downloads.')}</p></div><button className="secondary-button" onClick={() => onOpenCategory('optional-engines')}>{tr('Explore optional engines')}</button></section>
  </div>
}
