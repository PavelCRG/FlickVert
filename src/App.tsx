import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { accentColors, loadSettings, normalizeSettings, saveSettings, type AccentColor, type AppSettings } from './settings'
import { t, type MessageKey } from './i18n'
import ImageEditor, { type ImageEditTool } from './image-editor/ImageEditor'
import UpdateNotice from './updates/UpdateNotice'

type HistoryEntry = { id: string; fileName: string; size: number; output: string }
type Engines = { ffmpeg: boolean; pandoc: boolean; imagemagick: boolean; libreoffice: boolean; poppler: boolean }
type Section = 'history' | 'settings'
type Segment<Value extends string> = { value: Value; label: string }

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="setting-row"><span>{label}</span>{children}</div>
}

function SegmentedControl<Value extends string>({ label, value, options, onChange }: {
  label: string
  value: Value
  options: Segment<Value>[]
  onChange: (value: Value) => void
}) {
  return <div className="segmented-control" role="group" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} className={value === option.value ? 'selected' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>
}

function AccentPicker({ label, value, onChange, tr }: {
  label: string
  value: AccentColor
  onChange: (value: AccentColor) => void
  tr: (key: MessageKey) => string
}) {
  const options: { value: AccentColor; label: MessageKey }[] = [
    { value: 'blue', label: 'Blue' }, { value: 'violet', label: 'Violet' }, { value: 'teal', label: 'Teal' },
    { value: 'green', label: 'Green' }, { value: 'rose', label: 'Rose' },
  ]
  return <div className="accent-picker" role="group" aria-label={label}>
    {options.map((option) => <button
      key={option.value}
      type="button"
      className={value === option.value ? 'accent-swatch selected' : 'accent-swatch'}
      style={{ '--swatch': accentColors[option.value] } as CSSProperties}
      aria-label={`${label}: ${tr(option.label)}`}
      aria-pressed={value === option.value}
      title={tr(option.label)}
      onClick={() => onChange(option.value)}
    ><span aria-hidden="true"/></button>)}
  </div>
}

function NavIcon({ section }: { section: Section }) {
  return section === 'settings'
    ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5h13M3.5 10h13M3.5 15h13"/><circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="10" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>
    : <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 6v4l2.5 1.5"/></svg>
}

function loadHistory(): HistoryEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('flickvert-history') || '[]')
    return Array.isArray(value) ? value.filter((entry): entry is HistoryEntry => {
      if (!entry || typeof entry !== 'object') return false
      const row = entry as Record<string, unknown>
      return typeof row.id === 'string' && typeof row.fileName === 'string' && typeof row.output === 'string' && Number.isFinite(row.size)
    }).slice(0, 100) : []
  } catch { return [] }
}

const sizeOf = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function App() {
  const [section, setSection] = useState<Section>('settings')
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [preferences, setPreferences] = useState<AppSettings>(loadSettings)
  const [shortcutError, setShortcutError] = useState(false)
  const [pickError, setPickError] = useState(false)
  const [imageEdit, setImageEdit] = useState<{ inputPath: string; initialTool: ImageEditTool } | null>(null)
  const [engines, setEngines] = useState<Engines>({ ffmpeg: false, pandoc: false, imagemagick: false, libreoffice: false, poppler: false })
  const tr = (key: MessageKey) => t(preferences.language, key)
  const windowLabels = preferences.language === 'ru' ? ['Свернуть', 'Развернуть или восстановить', 'Закрыть'] : preferences.language === 'zh' ? ['最小化', '最大化或还原', '关闭'] : ['Minimize', 'Maximize or restore', 'Close']

  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    const stops: (() => void)[] = []
    const addStop = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }
    void listen<string>('flickvert://quick-action', ({ payload }) => setSection(payload === 'history' ? 'history' : 'settings')).then(addStop)
    void listen<{ inputPath: string; initialTool: ImageEditTool }>('flickvert://image-editor-open', ({ payload }) => {
      if (typeof payload.inputPath === 'string') { setSection('settings'); setImageEdit(payload) }
    }).then(addStop)
    void listen<Omit<HistoryEntry, 'id'>>('flickvert://job-completed', ({ payload }) => {
      if (typeof payload.fileName !== 'string' || typeof payload.output !== 'string' || !Number.isFinite(payload.size)) return
      setHistory((current) => [{ id: crypto.randomUUID(), ...payload }, ...current].slice(0, 100))
    }).then(addStop)
    return () => { disposed = true; stops.forEach((stop) => stop()) }
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    void invoke('register_shortcut', { shortcut: preferences.shortcut }).then(() => setShortcutError(false)).catch(() => setShortcutError(true))
  }, [preferences.shortcut])

  useEffect(() => {
    if (isTauri()) void invoke<Engines>('engine_status').then(setEngines).catch(() => {})
  }, [])

  useEffect(() => {
    try { localStorage.setItem('flickvert-history', JSON.stringify(history)) } catch {}
  }, [history])

  function updatePreferences(patch: Partial<AppSettings>) {
    const next = normalizeSettings({ ...preferences, ...patch })
    setPreferences(next)
    saveSettings(next)
    if (isTauri()) void emit('flickvert://settings-changed', next).catch(() => {})
  }

  async function updateShortcut(shortcut: string) {
    try {
      await invoke('register_shortcut', { shortcut })
      setShortcutError(false)
      updatePreferences({ shortcut })
    } catch { setShortcutError(true) }
  }

  async function chooseFiles() {
    try { await invoke('choose_files'); setPickError(false) }
    catch { setPickError(true) }
  }

  async function chooseOutputFolder() {
    const folder = await invoke<string | null>('choose_output_folder')
    if (folder) updatePreferences({ outputFolder: folder })
  }

  return <div className={`app ${preferences.appearance}`} data-accent={preferences.accent} style={{ '--accent-base': accentColors[preferences.accent] } as CSSProperties}>
    <header className="window-bar">
      <div className="window-drag" onMouseDown={(event) => { if (event.button === 0 && isTauri()) { if (event.detail === 2) void getCurrentWindow().toggleMaximize(); else void getCurrentWindow().startDragging() } }}><span>FlickVert</span></div>
      <div className="window-controls">
        <button type="button" aria-label={windowLabels[0]} title={windowLabels[0]} onClick={() => void getCurrentWindow().minimize()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button>
        <button type="button" aria-label={windowLabels[1]} title={windowLabels[1]} onClick={() => void getCurrentWindow().toggleMaximize()}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9"/></svg></button>
        <button className="window-close" type="button" aria-label={windowLabels[2]} title={windowLabels[2]} onClick={() => void getCurrentWindow().close()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>
      </div>
    </header>
    {(['North', 'South', 'East', 'West', 'NorthEast', 'NorthWest', 'SouthEast', 'SouthWest'] as const).map((direction) => <div key={direction} className={`window-resize resize-${direction}`} aria-hidden="true" onMouseDown={(event) => { if (event.button === 0 && isTauri()) void getCurrentWindow().startResizeDragging(direction) }}/>) }
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true" style={{ maskImage: "url('/fv-file-orange.png')", WebkitMaskImage: "url('/fv-file-orange.png')" }}/><span>FlickVert</span></div>
      <div className="side-label">{tr('Workspace')}</div>
      <nav aria-label="Main navigation">
        {(['settings', 'history'] as const).map((item) => <button key={item} aria-current={section === item ? 'page' : undefined} className={section === item ? 'nav-item active' : 'nav-item'} onClick={() => setSection(item)}>
          <NavIcon section={item}/><span>{tr(item === 'settings' ? 'Settings' : 'History')}</span>
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <UpdateNotice language={preferences.language}/>
        <div className="privacy"><svg className="privacy-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.4c0 3.8-2.6 6.4-6 8.1-3.4-1.7-6-4.3-6-8.1V5l6-2.5Z"/><path d="m7.2 9.8 1.8 1.8 3.8-4"/></svg><div><strong>{tr('Your files stay here')}</strong><small>{tr('Processed on this device')}</small></div></div>
        <div className="version">FlickVert <span>0.1.0</span></div>
      </div>
    </aside>

    <main className="main" tabIndex={0}>
      {section === 'history' ? <div className="page simple-page">
        <h1>{tr('History')}</h1>
        <p className="subtitle">{tr('Recent conversions are stored on this device.')}</p>
        {history.length ? <div className="file-list history-list">{history.map((item) => <article className="file-row" key={item.id}>
          <div className="file-icon">✓</div>
          <div className="file-info"><strong title={item.output}>{item.output}</strong><span>{item.fileName} · {sizeOf(item.size)}</span></div>
          <span className="status done">{tr('Converted')}</span>
        </article>)}</div> : <div className="empty-queue history-empty">
          <div className="empty-glyph">◷</div><div><strong>{tr('No completed conversions yet')}</strong><p>{tr('Completed conversions will appear here.')}</p></div>
        </div>}
      </div> : <div className="page settings-page">
        <header className="settings-header">
          <div><h1>{tr('Settings')}</h1><p className="subtitle">{tr('Control how FlickVert looks, opens, and saves files.')}</p></div>
          <button className="primary-button choose-files-button" onClick={() => void chooseFiles()}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>{tr('Choose files')}</button>
        </header>
        {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}

        <section className="settings-group" aria-labelledby="general-title">
          <h2 id="general-title">{tr('General')}</h2>
          <SettingsRow label={tr('Appearance')}><SegmentedControl label={tr('Appearance')} value={preferences.appearance} options={(['system', 'light', 'dark'] as const).map((value) => ({ value, label: tr(value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark') }))} onChange={(appearance) => updatePreferences({ appearance })}/></SettingsRow>
          <SettingsRow label={tr('Accent color')}><AccentPicker label={tr('Accent color')} value={preferences.accent} onChange={(accent) => updatePreferences({ accent })} tr={tr}/></SettingsRow>
          <SettingsRow label={tr('Language')}><SegmentedControl label={tr('Language')} value={preferences.language} options={(['en', 'ru', 'zh'] as const).map((value) => ({ value, label: tr(value === 'en' ? 'English' : value === 'ru' ? 'Russian' : 'Chinese') }))} onChange={(language) => updatePreferences({ language })}/></SettingsRow>
        </section>

        <section className="settings-group" aria-labelledby="shortcut-title">
          <h2 id="shortcut-title">{tr('Keyboard')}</h2>
          <div className="setting-row"><span>{tr('Quick shortcut')}</span><details className="shortcut-dropdown" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false }} onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && event.currentTarget.open) {
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.shortcut-options button'))
              const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (current + 1) % buttons.length : (current <= 0 ? buttons.length - 1 : current - 1)
              event.preventDefault(); buttons[next]?.focus()
            }
          }}>
            <summary aria-label={`${tr('Quick shortcut')}: ${preferences.shortcut.replaceAll('+', ' + ')}`}><span>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : 'Space').join(' + ')}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary>
            <div className="shortcut-options">{[['CTRL+ALT+SPACE', 'Ctrl + Alt + Space'], ['CTRL+SHIFT+SPACE', 'Ctrl + Shift + Space'], ['ALT+SHIFT+SPACE', 'Alt + Shift + Space']].map(([value, label]) => <button type="button" key={value} aria-pressed={preferences.shortcut === value} onClick={(event) => { const dropdown = event.currentTarget.closest('details'); dropdown?.removeAttribute('open'); dropdown?.querySelector('summary')?.focus(); void updateShortcut(value) }}><span>{label}</span>{preferences.shortcut === value && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>}</button>)}</div>
          </details></div>
          {shortcutError && <p className="shortcut-error">{tr('Shortcut unavailable. Use the tray menu.')}</p>}
        </section>

        <section className="settings-group" aria-labelledby="output-title">
          <h2 id="output-title">{tr('Output settings')}</h2>
          <div className="setting-fields">
            <label className="field"><span>{tr('Quality')} · {preferences.quality}%</span><input type="range" min="40" max="100" value={preferences.quality} onChange={(event) => updatePreferences({ quality: Number(event.target.value) })}/></label>
            <label className="field"><span>{tr('Max width')}</span><input type="number" min="1" max="32768" value={preferences.width ?? ''} onChange={(event) => updatePreferences({ width: event.target.value ? Number(event.target.value) : undefined })}/></label>
            <label className="field"><span>{tr('Max height')}</span><input type="number" min="1" max="32768" value={preferences.height ?? ''} onChange={(event) => updatePreferences({ height: event.target.value ? Number(event.target.value) : undefined })}/></label>
          </div>
          <div className="output-folder-setting"><div><strong>{tr('Save location')}</strong><span title={preferences.outputFolder}>{preferences.outputFolder || tr('Same folder as original')}</span></div>
            <button className="secondary-button" onClick={() => void chooseOutputFolder()}>{tr('Choose folder')}</button>
            {preferences.outputFolder && <button className="secondary-button" onClick={() => updatePreferences({ outputFolder: undefined })}>{tr('Use source folder')}</button>}
          </div>
        </section>

        <section className="settings-group" aria-labelledby="engines-title">
          <h2 id="engines-title">{tr('Conversion engines')}</h2>
          <div className="engine-status">{([['FFmpeg', engines.ffmpeg], ['Pandoc', engines.pandoc], ['ImageMagick', engines.imagemagick], ['LibreOffice', engines.libreoffice], ['Poppler', engines.poppler]] as const).map(([name, available]) => <div key={name}><span>{name}</span><span className={available ? 'engine-found' : ''}>{tr(available ? 'Detected' : 'Not detected on PATH')}</span></div>)}</div>
        </section>
        <p className="settings-note">{tr('Your files stay on this device. Processing runs locally.')}</p>
      </div>}
    </main>
    {imageEdit && <ImageEditor inputPath={imageEdit.inputPath} initialTool={imageEdit.initialTool} outputFolder={preferences.outputFolder} onClose={() => setImageEdit(null)}/>}
  </div>
}
