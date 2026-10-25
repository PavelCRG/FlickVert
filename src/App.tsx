import { useEffect, useState, type ReactNode } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { loadSettings, normalizeSettings, saveSettings, type AppSettings } from './settings'
import { t, type MessageKey } from './i18n'
import ImageEditor, { type ImageEditTool } from './ImageEditor'

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

  useEffect(() => {
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

  return <div className={`app ${preferences.appearance}`}>
    <aside className="sidebar">
      <div className="brand"><img className="brand-mark" src="/fv-mark.svg" alt=""/><span>FlickVert</span></div>
      <div className="side-label">{tr('Workspace')}</div>
      <nav aria-label="Main navigation">
        {(['settings', 'history'] as const).map((item) => <button key={item} aria-current={section === item ? 'page' : undefined} className={section === item ? 'nav-item active' : 'nav-item'} onClick={() => setSection(item)}>
          <NavIcon section={item}/><span>{tr(item === 'settings' ? 'Settings' : 'History')}</span>
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy"><span className="privacy-icon">●</span><div><strong>{tr('Your files stay here')}</strong><small>{tr('Processed on this device')}</small></div></div>
        <div className="version">FlickVert <span>0.1.0</span></div>
      </div>
    </aside>

    <main className="main">
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
          <button className="secondary-button choose-files-button" onClick={() => void chooseFiles()}>{tr('Choose files')}</button>
        </header>
        {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}

        <section className="settings-group" aria-labelledby="general-title">
          <h2 id="general-title">{tr('General')}</h2>
          <SettingsRow label={tr('Appearance')}><SegmentedControl label={tr('Appearance')} value={preferences.appearance} options={(['system', 'light', 'dark'] as const).map((value) => ({ value, label: tr(value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark') }))} onChange={(appearance) => updatePreferences({ appearance })}/></SettingsRow>
          <SettingsRow label={tr('Language')}><SegmentedControl label={tr('Language')} value={preferences.language} options={(['en', 'ru', 'zh'] as const).map((value) => ({ value, label: tr(value === 'en' ? 'English' : value === 'ru' ? 'Russian' : 'Chinese') }))} onChange={(language) => updatePreferences({ language })}/></SettingsRow>
        </section>

        <section className="settings-group" aria-labelledby="shortcut-title">
          <h2 id="shortcut-title">{tr('Keyboard')}</h2>
          <div className="setting-row"><span>{tr('Quick shortcut')}</span><label className="field shortcut-field"><select aria-label={tr('Quick shortcut')} value={preferences.shortcut} onChange={(event) => void updateShortcut(event.target.value)}>
            <option value="CTRL+ALT+SPACE">Ctrl + Alt + Space</option><option value="CTRL+SHIFT+SPACE">Ctrl + Shift + Space</option><option value="ALT+SHIFT+SPACE">Alt + Shift + Space</option>
          </select></label></div>
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
