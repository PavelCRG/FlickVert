import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { accentColor, accentColors, loadSettings, normalizeSettings, saveSettings, validShortcut, type AccentColor, type AppSettings } from './settings'
import { audioToolActions, fileActionsForPlatform, imageToolActions, videoToolActions } from './quick-menu/quick-actions'
import { ActionIcon } from './quick-menu/ActionIcon'
import { t, type MessageKey } from './i18n'
import ImageEditor, { type ImageEditTool } from './image-editor/ImageEditor'
import UpdateNotice from './updates/UpdateNotice'

type Engines = { ffmpeg: boolean; pandoc: boolean; imagemagick: boolean; libreoffice: boolean; poppler: boolean }
type Section = 'guide' | 'home' | 'settings' | 'tools'
type SettingsPage = 'general' | 'appearance' | 'keyboard' | 'conversion' | 'files' | 'about'
type Segment<Value extends string> = { value: Value; label: string }
const modifierLabel = (key: 'SHIFT' | 'CTRL' | 'ALT') => key === 'SHIFT' ? 'Shift' : key === 'CTRL' ? (/Mac/.test(navigator.userAgent) ? 'Command' : 'Ctrl') : (/Mac/.test(navigator.userAgent) ? 'Control' : 'Alt')

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

function AccentPicker({ label, value, customValue, onChange, tr }: {
  label: string
  value: AccentColor
  customValue?: string
  onChange: (value: AccentColor, custom?: string) => void
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
      className={value === option.value && !customValue ? 'accent-swatch selected' : 'accent-swatch'}
      style={{ '--swatch': accentColors[option.value] } as CSSProperties}
      aria-label={`${label}: ${tr(option.label)}`}
      aria-pressed={value === option.value && !customValue}
      title={tr(option.label)}
      onClick={() => onChange(option.value)}
    ><span aria-hidden="true"/></button>)}
    <label className="custom-accent" title={tr('Custom color')}><input aria-label={tr('Custom color')} type="color" value={customValue || accentColors[value]} onChange={(event) => onChange(value, event.target.value)}/><span>{tr('Custom color')}</span></label>
  </div>
}

function NavIcon({ section }: { section: Section }) {
  return section === 'settings'
    ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5h13M3.5 10h13M3.5 15h13"/><circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="10" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg>
    : section === 'tools'
      ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12v10H4zM7 8h2m2 0h2M7 11h6"/></svg>
      : section === 'guide'
        ? <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M7.8 7.5a2.3 2.3 0 1 1 3.6 1.9c-.9.6-1.4 1-1.4 2.1M10 14.5v.1"/></svg>
        : section === 'home'
          ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 9 7-6 7 6v8h-5v-5H8v5H3z"/></svg>
          : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12v10H4zM7 8h2m2 0h2M7 11h6"/></svg>
}

function initialSection(): Section {
  try { return localStorage.getItem('flickvert-welcome-seen') === 'true' ? 'home' : 'guide' }
  catch { return 'home' }
}

export default function App() {
  const [section, setSection] = useState<Section>(initialSection)
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('general')
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [preferences, setPreferences] = useState<AppSettings>(loadSettings)
  const [shortcutError, setShortcutError] = useState(false)
  const [modifierError, setModifierError] = useState(false)
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
    void listen<string>('flickvert://quick-action', () => { setSection('settings'); setSettingsPage('general') }).then(addStop)
    void listen<{ inputPath: string; initialTool: ImageEditTool }>('flickvert://image-editor-open', ({ payload }) => {
      if (typeof payload.inputPath === 'string') { setSection('settings'); setImageEdit(payload) }
    }).then(addStop)
    return () => { disposed = true; stops.forEach((stop) => stop()) }
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    void invoke('register_shortcut', { shortcut: preferences.shortcut }).then(() => setShortcutError(false)).catch(() => setShortcutError(true))
  }, [preferences.shortcut])

  useEffect(() => {
    if (isTauri()) void invoke('configure_drag_modifiers', preferences.dragModifiers).then(() => setModifierError(false)).catch(() => setModifierError(true))
  }, [preferences.dragModifiers.convert, preferences.dragModifiers.tools, preferences.dragModifiers.actions])

  function updateDragModifier(mode: 'convert' | 'tools' | 'actions', value: 'SHIFT' | 'CTRL' | 'ALT') {
    updatePreferences({ dragModifiers: { ...preferences.dragModifiers, [mode]: value } })
  }

  useEffect(() => {
    if (!recordingShortcut) return
    const capture = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setRecordingShortcut(false); return }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return
      event.preventDefault()
      const key = event.key === ' ' ? 'SPACE' : event.key.toUpperCase()
      const shortcut = [event.ctrlKey && 'CTRL', event.altKey && 'ALT', event.shiftKey && 'SHIFT', key].filter(Boolean).join('+')
      setRecordingShortcut(false)
      if (validShortcut(shortcut)) void updateShortcut(shortcut)
      else setShortcutError(true)
    }
    window.addEventListener('keydown', capture, true)
    return () => window.removeEventListener('keydown', capture, true)
  }, [recordingShortcut])

  useEffect(() => {
    if (isTauri()) void invoke<Engines>('engine_status').then(setEngines).catch(() => {})
  }, [])

  function updatePreferences(patch: Partial<AppSettings>) {
    const next = normalizeSettings({ ...preferences, ...patch })
    setPreferences(next)
    saveSettings(next)
    if (isTauri()) void emit('flickvert://settings-changed', next).catch(() => {})
  }

  function dismissGuide() {
    try { localStorage.setItem('flickvert-welcome-seen', 'true') } catch {}
    setSection('tools')
  }

  async function updateShortcut(shortcut: string) {
    try {
      await invoke('register_shortcut', { shortcut })
      setShortcutError(false)
      updatePreferences({ shortcut })
    } catch {
      await invoke('register_shortcut', { shortcut: preferences.shortcut }).catch(() => {})
      setShortcutError(true)
    }
  }

  async function chooseFiles() {
    try { await invoke('choose_files'); setPickError(false) }
    catch { setPickError(true) }
  }

  async function chooseOutputFolder() {
    const folder = await invoke<string | null>('choose_output_folder')
    if (folder) updatePreferences({ outputFolder: folder })
  }

  return <div className={`app ${preferences.appearance}`} data-accent={preferences.accent} style={{ '--accent-base': accentColor(preferences) } as CSSProperties}>
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
        <button aria-current={section === 'home' ? 'page' : undefined} className={section === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('home')}><NavIcon section="home"/><span>{tr('Home')}</span></button>
        <button aria-current={section === 'tools' ? 'page' : undefined} className={section === 'tools' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('tools')}><NavIcon section="tools"/><span>{tr('Tools & formats')}</span></button>
        <button aria-current={section === 'settings' ? 'page' : undefined} className={section === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => { setSection('settings'); setSettingsPage('general') }}><NavIcon section="settings"/><span>{tr('Settings')}</span></button>
        <button aria-current={section === 'guide' ? 'page' : undefined} className={section === 'guide' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('guide')}><NavIcon section="guide"/><span>{tr('Quick start')}</span></button>
      </nav>
      {section === 'settings' && <nav className="settings-nav" aria-label={tr('Settings')}>
        {(['general', 'appearance', 'keyboard', 'conversion', 'files', 'about'] as const).map((item) => <button key={item} aria-current={settingsPage === item ? 'page' : undefined} className={settingsPage === item ? 'nav-item active' : 'nav-item'} onClick={() => setSettingsPage(item)}>{tr(item === 'general' ? 'General' : item === 'appearance' ? 'Appearance' : item === 'keyboard' ? 'Keyboard' : item === 'conversion' ? 'Conversion' : item === 'files' ? 'Files' : 'About')}</button>)}
      </nav>}
      <div className="sidebar-bottom">
        <UpdateNotice language={preferences.language}/>
        <div className="privacy"><svg className="privacy-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.4c0 3.8-2.6 6.4-6 8.1-3.4-1.7-6-4.3-6-8.1V5l6-2.5Z"/><path d="m7.2 9.8 1.8 1.8 3.8-4"/></svg><div><strong>{tr('Your files stay here')}</strong><small>{tr('Processed on this device')}</small></div></div>
        <div className="version">FlickVert <span>0.1.2</span></div>
      </div>
    </aside>

    <main className="main" tabIndex={0}>
      {section === 'home' ? <div className="page dashboard-page">
        <header className="settings-header"><div><p className="welcome-eyebrow">FlickVert</p><h1>{tr('Home')}</h1><p className="subtitle">{tr('The file tools you need, right where you work.')}</p></div><button className="primary-button choose-files-button" onClick={() => void chooseFiles()}>{tr('Choose files')}</button></header>
        {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}
        <section className="dashboard-start"><div><span className="dashboard-icon">↗</span><div><h2>{tr('Convert files')}</h2><p>{tr('Drop a file on the quick wheel or choose files to start.')}</p></div></div><button className="secondary-button" onClick={() => setSection('tools')}>{tr('Explore tools')}</button></section>
        <section className="dashboard-grid" aria-label={tr('Tools & formats')}>
          <button className="dashboard-card" onClick={() => setSection('tools')}><span className="dashboard-card-icon">IMG</span><strong>{tr('Images and PDFs')}</strong><small>PNG · JPEG · WebP · SVG · PDF</small></button>
          <button className="dashboard-card" onClick={() => setSection('tools')}><span className="dashboard-card-icon">DOC</span><strong>{tr('Documents')}</strong><small>DOCX · ODT · Markdown · HTML · EPUB</small></button>
          <button className="dashboard-card" onClick={() => setSection('tools')}><span className="dashboard-card-icon">AV</span><strong>{tr('Audio and video')}</strong><small>MP3 · WAV · MP4 · MOV · WebM · SRT</small></button>
          <button className="dashboard-card" onClick={() => setSection('tools')}><span className="dashboard-card-icon">ZIP</span><strong>{tr('Files and archives')}</strong><small>{tr('Create ZIP')} · {tr('Extract ZIP')} · {tr('Copy path')}</small></button>
        </section>
        <section className="settings-group dashboard-engines"><h2>{tr('Conversion engines')}</h2><div className="engine-status">{([['FFmpeg', engines.ffmpeg], ['Pandoc', engines.pandoc], ['ImageMagick', engines.imagemagick], ['LibreOffice', engines.libreoffice], ['Poppler', engines.poppler]] as const).map(([name, available]) => <div key={name}><span>{name}</span><span className={available ? 'engine-found' : ''}>{tr(available ? 'Detected' : 'Not detected on PATH')}</span></div>)}</div></section>
        <button className="dashboard-shortcut" onClick={() => { setSection('settings'); setSettingsPage('keyboard') }}><span>{tr('Quick shortcut')}</span><kbd>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : key === 'SPACE' ? 'Space' : key).join(' + ')}</kbd><span>{tr('Change shortcut')} →</span></button>
      </div> : section === 'tools' ? <div className="page tools-page">
        <header className="settings-header"><div><p className="welcome-eyebrow">FlickVert</p><h1>{tr('Tools & formats')}</h1><p className="subtitle">{tr('Browse every available tool and see what it needs.')}</p></div><button className="primary-button choose-files-button" onClick={() => void chooseFiles()}>{tr('Choose files')}</button></header>
        {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}
        <section className="settings-group"><h2>{tr('Convert files')}</h2><div className="conversion-catalog">
          <div><strong>{tr('Images and PDFs')}</strong><span>PNG · JPEG · WebP · GIF · BMP · SVG → PNG · JPEG · WebP · PDF</span><small>{tr('Built in')} · HEIC, HEIF, AVIF, TIFF, RAW {tr('Requires')} ImageMagick</small></div>
          <div><strong>{tr('Documents')}</strong><span>DOCX · ODT · Markdown · HTML · EPUB · RTF · TXT · RST · TEX</span><small>{tr('Requires')} Pandoc · DOC/XLS/PPT {tr('Requires')} LibreOffice</small></div>
          <div><strong>{tr('Audio and video')}</strong><span>AAC · FLAC · M4A · MP3 · OGG · WAV · AVI · MKV · MOV · MP4 · WebM</span><small>{tr('Requires')} FFmpeg · {tr('Subtitles')}: ASS · SRT · SSA · VTT</small></div>
          <div><strong>{tr('PDF documents')}</strong><span>PDF → PNG · JPEG · TXT · Markdown · DOCX · EPUB</span><small>{tr('Requires')} Poppler + Pandoc · {tr('Office files')}: XLSX · PPTX · ODS via LibreOffice</small></div>
        </div></section>
        <section className="settings-group"><h2>{tr('Images and PDFs')}</h2><p>{tr('Available when the matching file type is selected.')}</p><div className="tool-catalog">{imageToolActions.map((action) => <div className="catalog-row" key={action.id}><span className="catalog-icon"><ActionIcon name={action.glyph} className="action-icon"/></span><strong>{tr(action.label)}</strong><small>{tr('Built in')}</small></div>)}<div className="catalog-row"><span className="catalog-icon"><ActionIcon name="image" className="action-icon"/></span><strong>HEIC, HEIF, AVIF, TIFF</strong><small>{tr('Requires')} ImageMagick</small></div></div><p className="catalog-note">{tr('ImageMagick enables additional image formats.')}</p></section>
        <section className="settings-group"><h2>{tr('Video')}</h2><div className="tool-catalog">{videoToolActions.map((action) => <div className="catalog-row" key={action.id}><span className="catalog-icon"><ActionIcon name={action.glyph} className="action-icon"/></span><strong>{tr(action.label)}</strong><small>{tr('Requires')} FFmpeg</small></div>)}</div></section>
        <section className="settings-group"><h2>{tr('Audio')}</h2><div className="tool-catalog">{audioToolActions.map((action) => <div className="catalog-row" key={action.id}><span className="catalog-icon"><ActionIcon name={action.glyph} className="action-icon"/></span><strong>{tr(action.label)}</strong><small>{tr('Requires')} FFmpeg</small></div>)}</div></section>
        <section className="settings-group"><h2>{tr('Files and archives')}</h2><div className="tool-catalog">{fileActionsForPlatform(navigator.userAgent.includes('Windows')).map((action) => <div className="catalog-row" key={action.id}><span className="catalog-icon"><ActionIcon name={action.glyph} className="action-icon"/></span><strong>{tr(action.label === 'Open Terminal' && navigator.userAgent.includes('Windows') ? 'Open PowerShell' : action.label)}</strong><small>{tr('Built in')}</small></div>)}</div></section>
        <section className="settings-group"><h2>{tr('Convert files')}</h2><p>{tr('Optional engines only enable the formats they support.')}</p><div className="engine-status">{([['Pandoc', engines.pandoc], ['LibreOffice', engines.libreoffice], ['Poppler', engines.poppler], ['FFmpeg', engines.ffmpeg]] as const).map(([name, available]) => <div key={name}><span>{name}</span><span className={available ? 'engine-found' : ''}>{tr(available ? 'Detected' : 'Not detected on PATH')}</span></div>)}</div></section>
        <p className="catalog-note">{tr('Press Shift for formats, Ctrl or Command for tools, and Alt or Control for file actions.')}</p>
      </div> : section === 'guide' ? <div className="page welcome-page">
        <div className="welcome-mark" aria-hidden="true" style={{ maskImage: "url('/fv-file-orange.png')", WebkitMaskImage: "url('/fv-file-orange.png')" }}/>
        <p className="welcome-eyebrow">{tr('Quick start')}</p>
        <h1>{tr('Welcome to FlickVert')}</h1>
        <p className="welcome-intro">{tr('The file tools you need, right where you work.')}</p>
        <div className="welcome-steps">
          <article><span>1</span><div><strong>{tr('Drag while holding the left mouse button.')}</strong><p>{tr('Select a file in Explorer or Finder, then use the shortcut or choose files here.')}</p></div></article>
          <article><span>2</span><div><strong>{tr('Drag modifiers')}</strong><p>{tr('Formats modifier')}: {modifierLabel(preferences.dragModifiers.convert)} · {tr('Tools modifier')}: {modifierLabel(preferences.dragModifiers.tools)} · {tr('File actions modifier')}: {modifierLabel(preferences.dragModifiers.actions)}. {tr('Drop on an available action. Press Escape to cancel.')}</p></div></article>
        </div>
        <div className="welcome-details">
          <div><span>{tr('Your configured shortcut:')}</span><kbd>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : 'Space').join(' + ')}</kbd></div>
          <p>{tr('Your files stay here')} {tr('Processed on this device')}. {tr('Optional engines only enable the formats they support.')}</p>
          <p>{tr('Closing the window keeps FlickVert running in the tray. Use Quit in the tray menu to exit.')}</p>
        </div>
        <div className="welcome-actions">
          <button className="primary-button" onClick={dismissGuide}>{tr('Start using FlickVert')}</button>
          <button className="secondary-button" onClick={() => { dismissGuide(); void chooseFiles() }}>{tr('Choose files')}</button>
        </div>
      </div> : <div className="page settings-page">
        <header className="settings-header">
          <div><p className="welcome-eyebrow">FlickVert / {tr('Settings')}</p><h1>{tr(settingsPage === 'general' ? 'General' : settingsPage === 'appearance' ? 'Appearance' : settingsPage === 'keyboard' ? 'Keyboard' : settingsPage === 'conversion' ? 'Conversion' : settingsPage === 'files' ? 'Files' : 'About')}</h1><p className="subtitle">{tr('Control how FlickVert looks, opens, and saves files.')}</p></div>
        </header>
        {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}

        {settingsPage === 'general' && <section className="settings-group" aria-labelledby="general-title">
          <h2 id="general-title">{tr('General')}</h2>
          <div className="setting-row"><span>{tr('Quick start')}</span><button className="secondary-button" onClick={() => setSection('guide')}>{tr('Show quick start')}</button></div>
          <p className="catalog-note">{tr('Closing the window keeps FlickVert running in the tray. Use Quit in the tray menu to exit.')}</p>
        </section>}

        {settingsPage === 'appearance' && <section className="settings-group"><h2>{tr('Appearance')}</h2>
          <SettingsRow label={tr('Appearance')}><SegmentedControl label={tr('Appearance')} value={preferences.appearance} options={(['system', 'light', 'dark'] as const).map((value) => ({ value, label: tr(value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark') }))} onChange={(appearance) => updatePreferences({ appearance })}/></SettingsRow>
          <SettingsRow label={tr('Accent color')}><AccentPicker label={tr('Accent color')} value={preferences.accent} customValue={preferences.customAccent} onChange={(accent, customAccent) => updatePreferences(customAccent ? { accent, customAccent } : { accent, customAccent: undefined })} tr={tr}/></SettingsRow>
          <SettingsRow label={tr('Language')}><SegmentedControl label={tr('Language')} value={preferences.language} options={(['en', 'ru', 'zh'] as const).map((value) => ({ value, label: tr(value === 'en' ? 'English' : value === 'ru' ? 'Russian' : 'Chinese') }))} onChange={(language) => updatePreferences({ language })}/></SettingsRow>
        </section>}

        {settingsPage === 'keyboard' && <section className="settings-group" aria-labelledby="shortcut-title">
          <h2 id="shortcut-title">{tr('Keyboard')}</h2>
          <div className="setting-row"><span>{tr('Quick shortcut presets')}</span><details className="shortcut-dropdown" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false }} onKeyDown={(event) => {
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
          <div className="setting-row"><span>{tr('Custom shortcut')}</span><div className="shortcut-recorder"><kbd>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : key === 'SPACE' ? 'Space' : key).join(' + ')}</kbd><button className="secondary-button" onClick={() => { setShortcutError(false); setRecordingShortcut(true) }}>{tr(recordingShortcut ? 'Press a shortcut...' : 'Change shortcut')}</button></div></div>
          {recordingShortcut && <p className="catalog-note" role="status">{tr('Press a shortcut with Ctrl, Alt or Shift. Escape cancels.')}</p>}
          {shortcutError && <p className="shortcut-error">{tr('Shortcut unavailable. Use the tray menu.')}</p>}
          <p className="catalog-note">{tr('The shortcut opens the quick action wheel.')}</p>
          {(['convert', 'tools', 'actions'] as const).map((mode) => <SettingsRow key={mode} label={tr(mode === 'convert' ? 'Formats modifier' : mode === 'tools' ? 'Tools modifier' : 'File actions modifier')}><select className="modifier-select" value={preferences.dragModifiers[mode]} aria-label={tr(mode === 'convert' ? 'Formats modifier' : mode === 'tools' ? 'Tools modifier' : 'File actions modifier')} onChange={(event) => updateDragModifier(mode, event.target.value as 'SHIFT' | 'CTRL' | 'ALT')}>{(['SHIFT', 'CTRL', 'ALT'] as const).map((key) => <option key={key} value={key} disabled={key !== preferences.dragModifiers[mode] && Object.entries(preferences.dragModifiers).some(([other, assigned]) => other !== mode && assigned === key)}>{modifierLabel(key)}</option>)}</select></SettingsRow>)}
          {modifierError && <p className="shortcut-error">{tr('Could not update drag modifiers.')}</p>}
        </section>}

        {settingsPage === 'conversion' && <section className="settings-group" aria-labelledby="output-title">
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
        </section>}

        {settingsPage === 'conversion' && <section className="settings-group" aria-labelledby="engines-title">
          <h2 id="engines-title">{tr('Conversion engines')}</h2>
          <div className="engine-status">{([['FFmpeg', engines.ffmpeg], ['Pandoc', engines.pandoc], ['ImageMagick', engines.imagemagick], ['LibreOffice', engines.libreoffice], ['Poppler', engines.poppler]] as const).map(([name, available]) => <div key={name}><span>{name}</span><span className={available ? 'engine-found' : ''}>{tr(available ? 'Detected' : 'Not detected on PATH')}</span></div>)}</div>
        </section>}
        {settingsPage === 'files' && <section className="settings-group"><h2>{tr('Files')}</h2><div className="output-folder-setting"><div><strong>{tr('Save location')}</strong><span title={preferences.outputFolder}>{preferences.outputFolder || tr('Same folder as original')}</span></div><button className="secondary-button" onClick={() => void chooseOutputFolder()}>{tr('Choose folder')}</button>{preferences.outputFolder && <button className="secondary-button" onClick={() => updatePreferences({ outputFolder: undefined })}>{tr('Use source folder')}</button>}</div><p className="catalog-note">{tr('Your files stay on this device. Processing runs locally.')}</p></section>}
        {settingsPage === 'about' && <section className="settings-group"><h2>FlickVert 0.1.0</h2><p className="catalog-note">{tr('Your files stay on this device. Processing runs locally.')}</p></section>}
      </div>}
    </main>
    {imageEdit && <ImageEditor inputPath={imageEdit.inputPath} initialTool={imageEdit.initialTool} outputFolder={preferences.outputFolder} onClose={() => setImageEdit(null)}/>}
  </div>
}
