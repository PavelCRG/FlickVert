import { useState, type RefObject } from 'react'
import { AppIcon } from '../icons/AppIcon'
import type { AppIconName } from '../icons/AppIcon'
import { audioToolActions, fileActionsForPlatform, imageToolActions, pdfMergeActions, pdfPageActions, pdfSplitActions, videoToolActions, type QuickAction } from '../quick-menu/quick-actions'
import { conversionMatchesFamily, type ToolFamily } from './tool-family'
import { operationDetails } from './operation-details'
import type { MessageKey } from '../i18n'
import type { Engines, ConversionCatalogItem } from './types'

const categories = ['Images and PDFs', 'Documents', 'Audio', 'Audio and video', 'Subtitles', 'PDF documents'] as const
const categoryTabs: { id: ToolFamily; label: MessageKey; icon: AppIconName }[] = [
  { id: 'images', label: 'Images', icon: 'image' }, { id: 'video', label: 'Video', icon: 'film' },
  { id: 'audio', label: 'Audio', icon: 'audio' }, { id: 'pdf', label: 'PDF documents', icon: 'pdf' },
  { id: 'documents', label: 'Documents', icon: 'document' }, { id: 'slides', label: 'Slides', icon: 'document' },
  { id: 'spreadsheets', label: 'Spreadsheets', icon: 'document' }, { id: 'epub', label: 'EPUB', icon: 'document' },
  { id: 'subtitles', label: 'Subtitles', icon: 'film' }, { id: 'archives', label: 'Archives', icon: 'archive' },
]
const archiveActionIds = new Set(['create-zip', 'create-tar', 'create-targz', 'create-gzip', 'extract-archive'])

export function ToolsPage({ conversionCatalog, favorites, search, searchRef, engines, pickError, tr, onSearchChange, onChooseFiles, onToggleFavorite }: {
  conversionCatalog: ConversionCatalogItem[]
  favorites: string[]
  search: string
  searchRef: RefObject<HTMLInputElement | null>
  engines: Engines
  pickError: boolean
  tr: (key: MessageKey) => string
  onSearchChange: (search: string) => void
  onChooseFiles: () => void
  onToggleFavorite: (id: string) => void
}) {
  const [family, setFamily] = useState<ToolFamily>('all')
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const selectedFamilyLabel = categoryTabs.find((tab) => tab.id === family)?.label
  const matches = (...values: string[]) => !normalizedSearch || values.join(' ').toLocaleLowerCase().includes(normalizedSearch)
  const filterActions = (actions: readonly QuickAction[], group: MessageKey, engine = '') => !normalizedSearch || matches(tr(group)) ? [...actions] : actions.filter((action) => matches(tr(action.label), action.id, engine))
  const pdfToolActions = [...pdfMergeActions, ...pdfSplitActions, ...pdfPageActions]
  const allActions = [...imageToolActions, ...(engines.ffmpeg ? [...videoToolActions, ...audioToolActions] : []), ...fileActionsForPlatform(navigator.userAgent.includes('Windows'))]
  allActions.push(...pdfToolActions)
  const actionFamily = (id: string): ToolFamily | null => imageToolActions.some((action) => action.id === id) ? 'images' : videoToolActions.some((action) => action.id === id) ? 'video' : audioToolActions.some((action) => action.id === id) ? 'audio' : pdfToolActions.some((action) => action.id === id) ? 'pdf' : archiveActionIds.has(id) ? 'archives' : null
  const imageActions = family === 'all' || family === 'images' ? filterActions(imageToolActions, 'Images and PDFs') : []
  const videoActions = engines.ffmpeg && (family === 'all' || family === 'video') ? filterActions(videoToolActions, 'Video') : []
  const audioActions = engines.ffmpeg && (family === 'all' || family === 'audio') ? filterActions(audioToolActions, 'Audio') : []
  const availableFileActions = fileActionsForPlatform(navigator.userAgent.includes('Windows'))
  const fileActions = family === 'all' || family === 'archives' ? filterActions(availableFileActions.filter((action) => family !== 'archives' || archiveActionIds.has(action.id)), 'Files and archives') : []
  const pdfActions = family === 'all' || family === 'pdf' ? pdfToolActions.filter((action) => !normalizedSearch || matches(tr('PDF documents'), tr(action.label), action.id)) : []
  const favoriteActions = allActions.filter((action) => favorites.includes(action.id) && (family === 'all' || actionFamily(action.id) === family) && (!normalizedSearch || matches(tr(action.label), action.id)))
  const formatGroups = categories.map((title) => ({ title, items: conversionCatalog.filter((item) => item.available && item.category === title && conversionMatchesFamily(item.category, item.inputExtensions, family)) })).filter((group) => group.items.some((item) => matches(tr(group.title), selectedFamilyLabel ? tr(selectedFamilyLabel) : '', item.inputExtensions.join(' '), item.outputExtensions.join(' '))))
  const hasResults = favoriteActions.length + formatGroups.length + imageActions.length + videoActions.length + audioActions.length + fileActions.length + pdfActions.length > 0
  const catalogAction = (action: QuickAction, label = action.label) => { const detail = operationDetails[action.id]; return <div className="catalog-row" key={action.id}><span className="catalog-icon"><AppIcon name={action.glyph} className="action-icon"/></span><strong>{tr(label)}</strong><small>{tr('Built in')}</small>{detail && <span className="catalog-detail">{detail.input} → {detail.output}{detail.limitation !== 'Available when the matching file type is selected.' && <> · {tr(detail.limitation)}</>}</span>}<button type="button" className="catalog-choose-files" aria-label={tr('Choose files')} title={tr('Choose files')} onClick={onChooseFiles}><AppIcon name="file-plus"/></button><button type="button" className={`favorite-toggle${favorites.includes(action.id) ? ' selected' : ''}`} aria-label={tr(favorites.includes(action.id) ? 'Remove from favorites' : 'Add to favorites')} title={tr(favorites.includes(action.id) ? 'Remove from favorites' : 'Add to favorites')} aria-pressed={favorites.includes(action.id)} onClick={() => onToggleFavorite(action.id)}><AppIcon name="star"/></button></div> }

  return <div className="page tools-page">
    <header className="settings-header"><div><h1>{tr('Tools & formats')}</h1><p className="subtitle">{tr('Browse every available tool and see what it needs.')}</p></div><button className="primary-button choose-files-button" onClick={onChooseFiles}><AppIcon name="file-plus"/>{tr('Choose files')}</button></header>
    {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}
    <label className="tool-search"><AppIcon name="search"/><input ref={searchRef} type="search" aria-label={tr('Search tools and formats')} placeholder={tr('Search tools and formats')} value={search} onChange={(event) => onSearchChange(event.target.value)}/></label>
    <div className="family-filter" role="group" aria-label={tr('Filter by family')}><button type="button" aria-pressed={family === 'all'} onClick={() => setFamily('all')}>{tr('All tools')}</button>{categoryTabs.map(({ id, label, icon }) => <button key={id} type="button" aria-pressed={family === id} onClick={() => setFamily(id)}><AppIcon name={icon}/>{tr(label)}</button>)}</div>
    {favoriteActions.length > 0 && <section className="settings-group"><h2>{tr('Favorites')}</h2><div className="tool-catalog">{favoriteActions.map((action) => catalogAction(action))}</div></section>}
    {formatGroups.length > 0 && <section className="settings-group"><h2>{tr('Convert files')}</h2><div className="conversion-catalog">{formatGroups.flatMap((group) => group.items.filter((item) => matches(tr(group.title), selectedFamilyLabel ? tr(selectedFamilyLabel) : '', item.inputExtensions.join(' '), item.outputExtensions.join(' '))).map((item) => <div key={`${group.title}-${item.engine}-${item.inputExtensions.join('-')}`}><strong>{family === 'all' ? tr(group.title) : tr(selectedFamilyLabel!)}</strong><span>{item.inputExtensions.map((extension) => `.${extension}`).join(' · ')} → {item.outputExtensions.map((extension) => `.${extension}`).join(' · ')}</span><small>{tr(item.engine === 'Built in' ? 'Built in' : item.available ? 'Detected' : 'Not installed')}</small>{['Documents', 'PDF documents'].includes(group.title) && <small>{tr('Document conversion may change the original layout depending on the source and output formats.')}</small>}{item.limitation && <small>{tr(item.limitation as MessageKey)}</small>}</div>))}</div></section>}
    {imageActions.length > 0 && <section id="image-tools" className="settings-group"><h2>{tr('Images and PDFs')}</h2><p>{tr('Available when the matching file type is selected.')}</p><div className="tool-catalog">{imageActions.map((action) => catalogAction(action))}</div></section>}
    {videoActions.length > 0 && <section id="video-tools" className="settings-group"><h2>{tr('Video')}</h2><div className="tool-catalog">{videoActions.map((action) => catalogAction(action))}</div></section>}
    {audioActions.length > 0 && <section className="settings-group"><h2>{tr('Audio')}</h2><div className="tool-catalog">{audioActions.map((action) => catalogAction(action))}</div></section>}
    {pdfActions.length > 0 && <section id="pdf-actions" className="settings-group"><h2>{tr('PDF documents')}</h2><div className="tool-catalog">{pdfActions.map((action) => catalogAction(action))}</div></section>}
    {fileActions.length > 0 && <section id="file-tools" className="settings-group"><h2>{tr('Files and archives')}</h2><div className="tool-catalog">{fileActions.map((action) => catalogAction(action, action.label === 'Open Terminal' && navigator.userAgent.includes('Windows') ? 'Open PowerShell' : action.label))}</div></section>}
    <p className="catalog-note">{tr('Press Shift for formats, Ctrl or Command for tools, and Alt or Control for file actions.')}</p>
    {!hasResults && (normalizedSearch || family !== 'all') && <div className="settings-group tool-empty"><AppIcon name="search"/><p>{tr('No matching tools or formats')}</p>{normalizedSearch && <button className="secondary-button" onClick={() => onSearchChange('')}>{tr('Clear search')}</button>}</div>}
  </div>
}
