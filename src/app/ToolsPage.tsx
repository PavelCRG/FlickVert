import type { RefObject } from 'react'
import { AppIcon } from '../icons/AppIcon'
import { audioToolActions, fileActionsForPlatform, imageToolActions, videoToolActions, type QuickAction } from '../quick-menu/quick-actions'
import type { MessageKey } from '../i18n'
import type { Engines, ConversionCatalogItem } from './types'

const categories = [['Images and PDFs', 'image-tools'], ['Documents', 'document-tools'], ['Audio and video', 'video-tools'], ['PDF documents', 'pdf-tools']] as const

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
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const matches = (...values: string[]) => !normalizedSearch || values.join(' ').toLocaleLowerCase().includes(normalizedSearch)
  const filterActions = (actions: readonly QuickAction[], group: MessageKey) => !normalizedSearch || matches(tr(group)) ? [...actions] : actions.filter((action) => matches(tr(action.label), action.id))
  const imageActions = filterActions(imageToolActions, 'Images and PDFs')
  const videoActions = filterActions(videoToolActions, 'Video')
  const audioActions = filterActions(audioToolActions, 'Audio')
  const fileActions = filterActions(fileActionsForPlatform(navigator.userAgent.includes('Windows')), 'Files and archives')
  const favoriteActions = [...imageToolActions, ...videoToolActions, ...audioToolActions, ...fileActionsForPlatform(navigator.userAgent.includes('Windows'))].filter((action) => favorites.includes(action.id))
  const formatGroups = categories.map(([title, id]) => ({ title, id, items: conversionCatalog.filter((item) => item.category === title) })).filter((group) => group.items.some((item) => matches(tr(group.title), item.inputExtensions.join(' '), item.outputExtensions.join(' '), item.engine)))
  const hasResults = formatGroups.length + imageActions.length + videoActions.length + audioActions.length + fileActions.length > 0
  const catalogAction = (action: QuickAction, requiresFfmpeg = false, label = action.label) => <div className="catalog-row" key={action.id}><span className="catalog-icon"><AppIcon name={action.glyph} className="action-icon"/></span><strong>{tr(label)}</strong><small>{requiresFfmpeg ? `${tr('Requires')} FFmpeg` : tr('Built in')}</small><button type="button" className={`favorite-toggle${favorites.includes(action.id) ? ' selected' : ''}`} aria-label={tr(favorites.includes(action.id) ? 'Remove from favorites' : 'Add to favorites')} aria-pressed={favorites.includes(action.id)} onClick={() => onToggleFavorite(action.id)}><AppIcon name="star"/></button></div>
  const engineStatus = (order: readonly (keyof Engines)[]) => <div className="engine-status">{order.map((engine) => <div key={engine}><span>{engine === 'imagemagick' ? 'ImageMagick' : engine === 'libreoffice' ? 'LibreOffice' : engine[0].toUpperCase() + engine.slice(1)}</span><span className={engines[engine] ? 'engine-found' : ''}>{tr(engines[engine] ? 'Detected' : 'Not detected on PATH')}</span></div>)}</div>

  return <div className="page tools-page">
    <header className="settings-header"><div><h1>{tr('Tools & formats')}</h1><p className="subtitle">{tr('Browse every available tool and see what it needs.')}</p></div><button className="primary-button choose-files-button" onClick={onChooseFiles}><AppIcon name="file-plus"/>{tr('Choose files')}</button></header>
    {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}
    <label className="tool-search"><AppIcon name="search"/><input ref={searchRef} type="search" aria-label={tr('Search tools and formats')} placeholder={tr('Search tools and formats')} value={search} onChange={(event) => onSearchChange(event.target.value)}/></label>
    {favoriteActions.length > 0 && <section className="settings-group"><h2>{tr('Favorites')}</h2><div className="tool-catalog">{favoriteActions.map((action) => catalogAction(action, videoToolActions.some((tool) => tool.id === action.id) || audioToolActions.some((tool) => tool.id === action.id)))}</div></section>}
    <section className="settings-group"><h2>{tr('Convert files')}</h2><div className="conversion-catalog">{formatGroups.flatMap((group) => group.items.filter((item) => matches(tr(group.title), item.inputExtensions.join(' '), item.outputExtensions.join(' '), item.engine)).map((item, index) => <div id={index === 0 ? group.id : undefined} key={`${group.title}-${item.engine}-${item.inputExtensions.join('-')}`}><strong>{tr(group.title)}</strong><span>{item.inputExtensions.map((extension) => `.${extension}`).join(' · ')} → {item.outputExtensions.map((extension) => `.${extension}`).join(' · ')}</span><small>{item.engine === 'Built in' ? tr('Built in') : `${tr('Requires')} ${item.engine} · ${tr(item.available ? 'Detected' : 'Not detected on PATH')}`}</small></div>))}</div></section>
    {imageActions.length || matches('HEIC HEIF AVIF TIFF ImageMagick') ? <section id="image-tools" className="settings-group"><h2>{tr('Images and PDFs')}</h2><p>{tr('Available when the matching file type is selected.')}</p><div className="tool-catalog">{imageActions.map((action) => catalogAction(action))}{matches('HEIC HEIF AVIF TIFF ImageMagick') && <div className="catalog-row"><span className="catalog-icon"><AppIcon name="image" className="action-icon"/></span><strong>HEIC, HEIF, AVIF, TIFF</strong><small>{tr('Requires')} ImageMagick</small></div>}</div><p className="catalog-note">{tr('ImageMagick enables additional image formats.')}</p></section> : null}
    {videoActions.length > 0 && <section id="video-tools" className="settings-group"><h2>{tr('Video')}</h2><div className="tool-catalog">{videoActions.map((action) => catalogAction(action, true))}</div></section>}
    {audioActions.length > 0 && <section className="settings-group"><h2>{tr('Audio')}</h2><div className="tool-catalog">{audioActions.map((action) => catalogAction(action, true))}</div></section>}
    {fileActions.length > 0 && <section id="file-tools" className="settings-group"><h2>{tr('Files and archives')}</h2><div className="tool-catalog">{fileActions.map((action) => catalogAction(action, false, action.label === 'Open Terminal' && navigator.userAgent.includes('Windows') ? 'Open PowerShell' : action.label))}</div></section>}
    <section className="settings-group"><h2>{tr('Conversion engines')}</h2><p>{tr('Optional engines only enable the formats they support.')}</p>{engineStatus(['pandoc', 'libreoffice', 'poppler', 'ffmpeg', 'imagemagick'])}</section>
    <p className="catalog-note">{tr('Press Shift for formats, Ctrl or Command for tools, and Alt or Control for file actions.')}</p>
    {normalizedSearch && !hasResults && <div className="settings-group tool-empty"><AppIcon name="search"/><p>{tr('No matching tools or formats')}</p></div>}
  </div>
}
