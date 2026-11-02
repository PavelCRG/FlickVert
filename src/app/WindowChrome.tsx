import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'
import { AppIcon } from '../icons/AppIcon'

export function WindowChrome({ language }: { language: 'en' | 'ru' | 'zh' }) {
  const labels = language === 'ru' ? ['Свернуть', 'Развернуть или восстановить', 'Закрыть'] : language === 'zh' ? ['最小化', '最大化或还原', '关闭'] : ['Minimize', 'Maximize or restore', 'Close']
  return <>
    <header className="window-bar">
      <div className="window-drag" onMouseDown={(event) => { if (event.button === 0 && isTauri()) { if (event.detail === 2) void getCurrentWindow().toggleMaximize(); else void getCurrentWindow().startDragging() } }}><span className="window-brand-mark" aria-hidden="true" style={{ maskImage: "url('/fv-file-orange.png')", WebkitMaskImage: "url('/fv-file-orange.png')" }}/><span>FlickVert</span></div>
      <div className="window-controls">
        <button type="button" aria-label={labels[0]} title={labels[0]} onClick={() => void getCurrentWindow().minimize()}><AppIcon name="minimize"/></button>
        <button type="button" aria-label={labels[1]} title={labels[1]} onClick={() => void getCurrentWindow().toggleMaximize()}><AppIcon name="maximize"/></button>
        <button className="window-close" type="button" aria-label={labels[2]} title={labels[2]} onClick={() => void getCurrentWindow().close()}><AppIcon name="close"/></button>
      </div>
    </header>
    {(['North', 'South', 'East', 'West', 'NorthEast', 'NorthWest', 'SouthEast', 'SouthWest'] as const).map((direction) => <div key={direction} className={`window-resize resize-${direction}`} aria-hidden="true" onMouseDown={(event) => { if (event.button === 0 && isTauri()) void getCurrentWindow().startResizeDragging(direction) }}/>) }
  </>
}
