import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import type { ChangeEvent } from 'react'
import { AppIcon } from '../icons/AppIcon'

export function WindowChrome({ language, photo, photoEnabled, onChoosePhoto, onTogglePhoto, onRemovePhoto, tr }: { language: 'en' | 'ru' | 'zh'; photo: string | null; photoEnabled: boolean; onChoosePhoto: (event: ChangeEvent<HTMLInputElement>) => void; onTogglePhoto: () => void; onRemovePhoto: () => void; tr: (key: import('../i18n').MessageKey) => string }) {
  const labels = language === 'ru' ? ['Свернуть', 'Развернуть или восстановить', 'Закрыть'] : language === 'zh' ? ['最小化', '最大化或还原', '关闭'] : ['Minimize', 'Maximize or restore', 'Close']
  return <>
    <header className="window-bar">
      <div className="window-drag" onMouseDown={(event) => { if (event.button === 0 && isTauri()) { if (event.detail === 2) void getCurrentWindow().toggleMaximize(); else void getCurrentWindow().startDragging() } }}><span className="window-brand-mark" aria-hidden="true" style={{ maskImage: "url('/fv-file-orange.png')", WebkitMaskImage: "url('/fv-file-orange.png')" }}/><span>FlickVert</span></div>
      <details className="photo-theme-menu">
        <summary aria-label={tr('Personalize with a photo')} title={tr('Personalize with a photo')}><AppIcon name="image"/></summary>
        <div className="photo-theme-popover">
          <strong>{tr('Your photo theme')}</strong><p>{tr('Your photo stays on this device.')}</p>
          {photo && <img className="photo-theme-preview" src={photo} alt={tr('Current theme photo')}/>}
          {photo && <button type="button" className="photo-theme-action" onClick={onTogglePhoto}>{tr(photoEnabled ? 'Turn off photo theme' : 'Use photo theme')}</button>}
          <label className="photo-theme-action">{tr(photo ? 'Change photo' : 'Choose a photo')}<input className="photo-theme-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={onChoosePhoto}/></label>
          {photo && <button type="button" className="photo-theme-remove" onClick={onRemovePhoto}>{tr('Remove photo')}</button>}
        </div>
      </details>
      <div className="window-controls">
        <button type="button" aria-label={labels[0]} title={labels[0]} onClick={() => void getCurrentWindow().minimize()}><AppIcon name="minimize"/></button>
        <button type="button" aria-label={labels[1]} title={labels[1]} onClick={() => void getCurrentWindow().toggleMaximize()}><AppIcon name="maximize"/></button>
        <button className="window-close" type="button" aria-label={labels[2]} title={labels[2]} onClick={() => void getCurrentWindow().close()}><AppIcon name="close"/></button>
      </div>
    </header>
    {(['North', 'South', 'East', 'West', 'NorthEast', 'NorthWest', 'SouthEast', 'SouthWest'] as const).map((direction) => <div key={direction} className={`window-resize resize-${direction}`} aria-hidden="true" onMouseDown={(event) => { if (event.button === 0 && isTauri()) void getCurrentWindow().startResizeDragging(direction) }}/>) }
  </>
}
