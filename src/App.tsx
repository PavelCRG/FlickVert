import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { loadSettings, normalizeSettings, saveSettings, type AppSettings } from './settings'
import { t, type MessageKey } from './i18n'

type HistoryEntry = { id: string; fileName: string; size: number; output: string }
type Engines = { ffmpeg: boolean; pandoc: boolean; imagemagick: boolean; libreoffice: boolean }
type Section = 'home' | 'history' | 'settings'

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
  const [section, setSection] = useState<Section>('home')
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [preferences, setPreferences] = useState<AppSettings>(loadSettings)
  const [shortcutError, setShortcutError] = useState(false)
  const [engines, setEngines] = useState<Engines>({ ffmpeg: false, pandoc: false, imagemagick: false, libreoffice: false })
  const tr = (key: MessageKey) => t(preferences.language, key)

  useEffect(() => {
    let disposed = false
    const stops: (() => void)[] = []
    const addStop = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }
    void listen<string>('flickvert://quick-action', ({ payload }) => setSection(payload === 'settings' ? 'settings' : 'home')).then(addStop)
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

  return <div className={`app ${preferences.appearance}`}>
    <aside className="sidebar">
      <div className="brand"><img className="brand-mark" src="/fv-mark.svg" alt=""/><span>FlickVert</span></div>
      <div className="side-label">{tr('Workspace')}</div>
      <nav aria-label="Main navigation">
        <button className={section === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('home')}>{tr('Home')}</button>
        <button className={section === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('history')}>{tr('History')}</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy"><span className="privacy-icon">●</span><div><strong>{tr('Your files stay here')}</strong><small>{tr('Processed on this device')}</small></div></div>
        <button className={section === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('settings')}>{tr('Settings')}</button>
        <div className="version">FlickVert <span>0.1.0</span></div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb">FlickVert <span>›</span><span>{tr(section === 'home' ? 'Home' : section === 'history' ? 'History' : 'Settings')}</span></div></header>
      {section === 'home' && <div className="page home-page">
        <div className="home-art" aria-hidden="true"><span className="home-ring home-ring-one"/><span className="home-ring home-ring-two"/><img src="/fv-mark.svg" alt=""/></div>
        <p className="eyebrow">{tr('PRIVATE BY DESIGN')}</p>
        <h1>FlickVert</h1>
        <p className="home-lead">{tr('Work with files where they are.')}</p>
        <p className="home-description">{tr('Drag a file in Explorer or Finder, press Shift, and drop it on an action.')}</p>
        <div className="home-steps" aria-label={tr('Quick shortcut')}>
          <div><kbd>⇧ Shift</kbd><span>{tr('Convert')}</span></div>
          <div><kbd>{navigator.platform.startsWith('Mac') ? '⌘ Command' : 'Ctrl'}</kbd><span>{tr('Tools')}</span></div>
          <div><kbd>{navigator.platform.startsWith('Mac') ? '⌥ Option' : 'Alt'}</kbd><span>{tr('Actions')}</span></div>
        </div>
        <p className="home-footnote">{tr('Quick shortcut')}: <kbd>{preferences.shortcut.replaceAll('+', ' + ')}</kbd> · {tr('Same folder as original')}</p>
      </div>}
      {section === 'history' && <div className="page simple-page"><p className="eyebrow">{tr('RECENT WORK')}</p><h1>{tr('History')}</h1><p className="subtitle">{tr('Recent conversions are stored on this device.')}</p>{history.length ? <div className="file-list history-list">{history.map((item) => <article className="file-row" key={item.id}><div className="file-icon">✓</div><div className="file-info"><strong title={item.output}>{item.output}</strong><span>{item.fileName} · {sizeOf(item.size)}</span></div><span className="status done">{tr('Converted')}</span></article>)}</div> : <div className="empty-queue history-empty"><div className="empty-glyph">◷</div><div><strong>{tr('No completed conversions yet')}</strong><p>{tr('Completed conversions will appear here.')}</p></div></div>}</div>}
      {section === 'settings' && <div className="page simple-page"><p className="eyebrow">{tr('MAKE IT YOURS')}</p><h1>{tr('Settings')}</h1><p className="subtitle">{tr('Choose how FlickVert looks.')}</p><h2 className="preference-heading">{tr('Appearance')}</h2><div className="theme-options">{(['system', 'light', 'dark'] as const).map((appearance) => <button key={appearance} className={preferences.appearance === appearance ? 'theme-option selected' : 'theme-option'} onClick={() => updatePreferences({ appearance })}>{tr(appearance === 'system' ? 'System' : appearance === 'light' ? 'Light' : 'Dark')}</button>)}</div><h2 className="preference-heading">{tr('Language')}</h2><div className="theme-options">{(['en', 'ru', 'zh'] as const).map((language) => <button key={language} className={preferences.language === language ? 'theme-option selected' : 'theme-option'} onClick={() => updatePreferences({ language })}>{tr(language === 'en' ? 'English' : language === 'ru' ? 'Russian' : 'Chinese')}</button>)}</div><h2 className="preference-heading">{tr('Quick shortcut')}</h2><label className="field shortcut-field"><select value={preferences.shortcut} onChange={(event) => { void updateShortcut(event.target.value) }}><option value="CTRL+ALT+SPACE">Ctrl + Alt + Space</option><option value="CTRL+SHIFT+SPACE">Ctrl + Shift + Space</option><option value="ALT+SHIFT+SPACE">Alt + Shift + Space</option></select></label>{shortcutError && <p className="shortcut-error">{tr('Shortcut unavailable. Use the tray menu.')}</p>}<h2 className="preference-heading">{tr('Output settings')}</h2><div className="home-settings"><label className="field"><span>{tr('Quality')} · {preferences.quality}%</span><input type="range" min="40" max="100" value={preferences.quality} onChange={(event) => updatePreferences({ quality: Number(event.target.value) })}/></label><label className="field"><span>{tr('Max width')}</span><input type="number" min="1" max="32768" value={preferences.width ?? ''} onChange={(event) => updatePreferences({ width: event.target.value ? Number(event.target.value) : undefined })}/></label><label className="field"><span>{tr('Max height')}</span><input type="number" min="1" max="32768" value={preferences.height ?? ''} onChange={(event) => updatePreferences({ height: event.target.value ? Number(event.target.value) : undefined })}/></label></div><h2 className="preference-heading">{tr('Conversion engines')}</h2><div className="engine-status">{[['FFmpeg', engines.ffmpeg], ['Pandoc', engines.pandoc], ['ImageMagick', engines.imagemagick], ['LibreOffice', engines.libreoffice]].map(([name, available]) => <div key={String(name)}><span>{name}</span><span className={available ? 'engine-found' : ''}>{tr(available ? 'Detected' : 'Not detected on PATH')}</span></div>)}</div><div className="settings-note">{tr('Your files stay on this device. Processing runs locally.')}</div></div>}
    </main>
  </div>
}
