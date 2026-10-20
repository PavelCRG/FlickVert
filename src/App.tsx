import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { convertImage } from './conversion/images'
import { loadSettings, saveSettings, type AppSettings } from './settings'
import { t, type MessageKey } from './i18n'

type Format = 'image/png' | 'image/jpeg' | 'image/webp'
type Item = { id: string; file: File; status: 'ready' | 'done' | 'error'; output?: string }
const formats: { value: Format; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
]
const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']
const supported = (file: File) => imageTypes.includes(file.type)
const sizeOf = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<string, ReactNode> = {
    mark: <><path d="M5 4h14v3H8v4h9v3H8v6H5z"/><path d="M13 4v6"/></>,
    convert: <><path d="M4 7h13l-3-3M20 17H7l3 3"/><path d="m17 4 3 3-3 3M7 14l-3 3 3 3"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5a7.5 7.5 0 0 0 0-3l2-1.5-2-3.5-2.4 1a8 8 0 0 0-2.6-1.5L13.5 2h-4L9 5a8 8 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 3l-2 1.5 2 3.5 2.4-1A8 8 0 0 0 9 19l.5 3h4l.5-3a8 8 0 0 0 2.6-1.5l2.4 1 2-3.5z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
  }
  return <svg {...common} aria-hidden="true">{paths[name] ?? paths.file}</svg>
}

export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [preferences, setPreferences] = useState<AppSettings>(loadSettings)
  const { format, quality, appearance: theme, language } = preferences
  const [section, setSection] = useState<'convert' | 'history' | 'settings'>('convert')
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [shortcutError, setShortcutError] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const ready = items.filter((item) => item.status === 'ready' && supported(item.file)).length
  const done = items.filter((item) => item.status === 'done').length
  const completed = items.filter((item) => item.status === 'done')

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false
    void listen<string>('flickvert://quick-action', ({ payload }) => {
      setSection(payload === 'settings' ? 'settings' : 'convert')
      if (payload === 'resize') setPreferences((current) => {
        const next = { ...current, width: 1920, height: 1920 }
        saveSettings(next)
        return next
      })
    }).then((stop) => { if (disposed) stop(); else unlisten = stop })
    return () => { disposed = true; unlisten?.() }
  }, [])

  useEffect(() => {
    void invoke('register_shortcut', { shortcut: preferences.shortcut })
      .then(() => setShortcutError(false))
      .catch(() => setShortcutError(true))
  }, [preferences.shortcut])

  function addFiles(files: FileList | File[]) {
    setItems((current) => {
      const next = [...current]
      for (const file of Array.from(files)) if (!next.some((item) => item.file.name === file.name && item.file.size === file.size)) {
        next.push({ id: crypto.randomUUID(), file, status: 'ready' })
      }
      return next
    })
  }
  function onDrop(event: DragEvent<HTMLElement>) { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }
  function onPick(event: ChangeEvent<HTMLInputElement>) { if (event.target.files) addFiles(event.target.files); event.target.value = '' }
  function updatePreferences(patch: Partial<AppSettings>) {
    const next = { ...preferences, ...patch }
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
  const tr = (key: MessageKey) => t(language, key)
  const typeOf = (file: File) => tr(supported(file) ? 'Image' : file.type.startsWith('video/') ? 'Video' : file.type.startsWith('audio/') ? 'Audio' : file.type === 'application/pdf' ? 'PDF document' : 'File')

  async function convert() {
    const work = items.filter((item) => item.status === 'ready' && supported(item.file))
    setConverting(true)
    try {
      for (const item of work) {
        try {
          const blob = await convertImage(item.file, { format, quality, width: preferences.width, height: preferences.height })
          const selected = formats.find((entry) => entry.value === format)!
          const name = `${item.file.name.replace(/\.[^.]+$/, '')}.${selected.ext}`
          const path = await invoke<string>('save_output', { fileName: name, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) })
          setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: 'done', output: path } : row))
        } catch {
          setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: 'error' } : row))
        }
      }
    } finally { setConverting(false) }
  }

  return <div className={`app ${theme}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={onDrop}>
    <aside className="sidebar">
      <div className="brand"><img className="brand-mark" src="/fv-mark.svg" alt=""/><span>FlickVert</span></div>
      <div className="side-label">{tr('Workspace')}</div>
      <nav aria-label="Main navigation">
        <button className={section === 'convert' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('convert')}><Icon name="convert"/><span>{tr('Convert files')}</span></button>
        <button className={section === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('history')}><Icon name="history"/><span>{tr('History')}</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy"><span className="privacy-icon"><Icon name="lock" size={16}/></span><div><strong>{tr('Your files stay here')}</strong><small>{tr('Processed on this device')}</small></div></div>
        <button className={section === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('settings')}><Icon name="settings"/><span>{tr('Settings')}</span></button>
        <div className="version">FlickVert <span>0.1.0</span></div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb">FlickVert <Icon name="arrow" size={14}/><span>{section === 'convert' ? tr('Convert files') : section === 'history' ? tr('History') : tr('Settings')}</span></div><button className="theme-button" title={tr('System appearance')} onClick={() => updatePreferences({ appearance: theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system' })}><Icon name="sun" size={17}/></button></header>
      {section === 'convert' && <div className="page">
        <div className="page-heading"><div className="heading-copy"><p className="eyebrow">{tr('PRIVATE BY DESIGN')}</p><h1>{tr('File conversion')}</h1><p className="subtitle">{tr('Add images, choose a format and save the result.')}</p></div><img className="hero-mark" src="/fv-mark.svg" alt="FlickVert FV monogram"/><div className="format-chip"><span className="chip-dot"/>{tr('Images · PNG, JPEG, WebP')}</div></div>
        <section className={`dropzone ${dragging ? 'dragging' : ''}`} onClick={() => input.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') input.current?.click() }} tabIndex={0} role="button" aria-label="Add files">
          <input ref={input} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md" onChange={onPick} hidden/>
          <div className="upload-icon"><Icon name="plus" size={23}/></div><div className="drop-title">{tr('Drop files here')}</div><div className="drop-subtitle">{tr('or')} <span>{tr('browse your computer')}</span></div><div className="drop-note">{tr('Files are processed on your device and never uploaded')}</div>
        </section>
        <section className="queue-section">
          <div className="section-heading"><div><h2>{tr('File queue')}</h2><span className="count">{items.length}</span></div>{items.length > 0 && <button className="text-button" onClick={() => setItems([])}>{tr('Clear queue')}</button>}</div>
          {items.length === 0 ? <div className="empty-queue"><div className="empty-glyph"><Icon name="file" size={21}/></div><div><strong>{tr('Your files will appear here')}</strong><p>{tr('Add one or more files to get started')}</p></div></div> : <div className="file-list">{items.map((item) => <article className="file-row" key={item.id}>
            <div className="file-icon"><Icon name={supported(item.file) ? 'image' : 'file'} size={19}/></div><div className="file-info"><strong title={item.file.name}>{item.file.name}</strong><span>{typeOf(item.file)} <i/> {sizeOf(item.file.size)}</span></div>
            {item.status === 'done' ? <span className="status done"><Icon name="check" size={14}/>{item.output ?? tr('Done')}</span> : item.status === 'error' ? <span className="status error">{tr('Could not convert')}</span> : supported(item.file) ? <span className="status ready">{tr('Ready to convert')}</span> : <span className="status unavailable">{tr('Format not supported')}</span>}
            <button className="remove-button" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} aria-label={`Remove ${item.file.name}`}><Icon name="close" size={17}/></button>
          </article>)}</div>}
        </section>
        <section className="settings-panel">
          <div className="settings-title"><div><h2>{tr('Output settings')}</h2><p>{tr('These settings apply to every image in the queue.')}</p></div><span className="settings-step">{tr('FORMAT')}</span></div>
          <div className="controls"><label className="field"><span>{tr('Convert to')}</span><select value={format} onChange={(event) => updatePreferences({ format: event.target.value as Format })}>{formats.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
            {format !== 'image/png' ? <label className="quality-field"><span>{tr('Quality')} <strong>{quality}%</strong></span><input type="range" min="40" max="100" value={quality} onChange={(event) => updatePreferences({ quality: Number(event.target.value) })}/></label> : <div className="quality-field lossless"><span>{tr('Quality')}</span><div>{tr('Lossless')}</div></div>}
            <div className="destination"><span>{tr('Save location')}</span><div><Icon name="file" size={15}/> {tr('Downloads / FlickVert')}</div></div>
            <label className="field"><span>{tr('Max width')}</span><input type="number" min="1" max="32768" placeholder="Original" value={preferences.width ?? ''} onChange={(event) => updatePreferences({ width: event.target.value ? Number(event.target.value) : undefined })}/></label>
            <label className="field"><span>{tr('Max height')}</span><input type="number" min="1" max="32768" placeholder="Original" value={preferences.height ?? ''} onChange={(event) => updatePreferences({ height: event.target.value ? Number(event.target.value) : undefined })}/></label>
          </div>
          {items.some((item) => item.file.type === 'image/gif' && item.status === 'ready') && <p className="animated-note">{tr('Animated GIFs are converted using the first frame.')}</p>}
        </section>
        <footer className="action-bar"><div className="action-hint">{items.length === 0 ? tr('Add images to get started') : ready === 0 ? tr('No supported images in the queue') : `${ready} ${tr(ready === 1 ? 'image' : 'images')} ${tr('Ready to convert').toLowerCase()}`}</div><button className="primary-button" onClick={convert} disabled={ready === 0 || converting}><Icon name="convert" size={17}/>{converting ? tr('Converting...') : done > 0 && ready === 0 ? tr('Done') : tr('Convert')}<span className="button-count">{ready || ''}</span></button></footer>
      </div>}
      {section === 'history' && <div className="page simple-page"><p className="eyebrow">{tr('RECENT WORK')}</p><h1>{tr('History')}</h1><p className="subtitle">{tr('Conversions completed during this session.')}</p>{completed.length ? <div className="file-list history-list">{completed.map((item) => <article className="file-row" key={item.id}><div className="file-icon"><Icon name="check" size={18}/></div><div className="file-info"><strong title={item.output}>{item.output}</strong><span>{typeOf(item.file)} <i/> {sizeOf(item.file.size)}</span></div><span className="status done">{tr('Converted')}</span></article>)}</div> : <div className="empty-queue history-empty"><div className="empty-glyph"><Icon name="history" size={21}/></div><div><strong>{tr('No completed conversions yet')}</strong><p>{tr('Converted files will appear here until you close FlickVert')}</p></div></div>}<button className="secondary-button" onClick={() => setSection('convert')}>{tr('Back to conversion')}</button></div>}
      {section === 'settings' && <div className="page simple-page"><p className="eyebrow">{tr('MAKE IT YOURS')}</p><h1>{tr('Settings')}</h1><p className="subtitle">{tr('Choose how FlickVert looks.')}</p><h2 className="preference-heading">{tr('Appearance')}</h2><div className="theme-options">{(['system', 'light', 'dark'] as const).map((appearance) => <button key={appearance} className={theme === appearance ? 'theme-option selected' : 'theme-option'} onClick={() => updatePreferences({ appearance })}>{tr(appearance === 'system' ? 'System' : appearance === 'light' ? 'Light' : 'Dark')}</button>)}</div><h2 className="preference-heading">{tr('Language')}</h2><div className="theme-options"><button className={language === 'en' ? 'theme-option selected' : 'theme-option'} onClick={() => updatePreferences({ language: 'en' })}>{tr('English')}</button><button className={language === 'ru' ? 'theme-option selected' : 'theme-option'} onClick={() => updatePreferences({ language: 'ru' })}>{tr('Russian')}</button></div><h2 className="preference-heading">{tr('Quick shortcut')}</h2><label className="field shortcut-field"><select value={preferences.shortcut} onChange={(event) => { void updateShortcut(event.target.value) }}><option value="CTRL+ALT+SPACE">Ctrl + Alt + Space</option><option value="CTRL+SHIFT+SPACE">Ctrl + Shift + Space</option><option value="ALT+SHIFT+SPACE">Alt + Shift + Space</option></select></label>{shortcutError && <p className="shortcut-error">{tr('Shortcut unavailable. Use the tray menu.')}</p>}<div className="settings-note"><Icon name="lock" size={17}/> {tr('Your files stay on this device. Image conversion runs locally.')}</div></div>}
    </main>
    {dragging && <div className="drag-overlay"><div><Icon name="plus" size={30}/><strong>{tr('Drop files to add them')}</strong></div></div>}
  </div>
}
