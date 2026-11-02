import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import { accentColor, createSettingsBackup, loadSettings, normalizeSettings, restoreSettingsBackup, saveSettings, validShortcut, type AppSettings } from './settings'
import { t, type MessageKey } from './i18n'
import ImageEditor, { type ImageEditTool } from './image-editor/ImageEditor'
import VideoTrimEditor from './video-trim/VideoTrimEditor'
import VideoThumbnailEditor from './video-trim/VideoThumbnailEditor'
import VideoExportPreview from './video-trim/VideoExportPreview'
import PdfMergeEditor from './pdf/PdfMergeEditor'
import PdfSplitEditor from './pdf/PdfSplitEditor'
import PdfPagesEditor from './pdf/PdfPagesEditor'
import { sizePresets } from './settings/SettingsControls'
import { SettingsView } from './app/SettingsView'
import { AppSidebar, type Section, type SettingsPage } from './app/AppSidebar'
import { WindowChrome } from './app/WindowChrome'
import { QuickStartPage } from './app/QuickStartPage'
import { HomePage } from './app/HomePage'
import { ToolsPage } from './app/ToolsPage'
import type { Engines, ConversionCatalogItem, OperationQueueItem } from './app/types'

export default function App() {
  const [section, setSection] = useState<Section>('home')
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('general')
  const [toolSearch, setToolSearch] = useState('')
  const toolSearchInput = useRef<HTMLInputElement>(null)
  const [toolCategory, setToolCategory] = useState<string | null>(null)
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [preferences, setPreferences] = useState<AppSettings>(loadSettings)
  const [presetName, setPresetName] = useState('')
  const [selectedDimensionPreset, setSelectedDimensionPreset] = useState('')
  const [presetSaved, setPresetSaved] = useState(false)
  const [shortcutError, setShortcutError] = useState(false)
  const [modifierError, setModifierError] = useState(false)
  const [pickError, setPickError] = useState(false)
  const [resultOpenError, setResultOpenError] = useState(false)
  const [settingsImportError, setSettingsImportError] = useState(false)
  const settingsImportInput = useRef<HTMLInputElement>(null)
  const [imageEdit, setImageEdit] = useState<{ inputPath: string; initialTool: ImageEditTool } | null>(null)
  const [videoTrimPath, setVideoTrimPath] = useState<string | null>(null)
  const [videoExportPaths, setVideoExportPaths] = useState<string[] | null>(null)
  const [pdfMergePaths, setPdfMergePaths] = useState<string[] | null>(null)
  const [pdfSplitPath, setPdfSplitPath] = useState<string | null>(null)
  const [pdfPagesPath, setPdfPagesPath] = useState<string | null>(null)
  const [videoThumbnailPath, setVideoThumbnailPath] = useState<string | null>(null)
  const [engines, setEngines] = useState<Engines>({ ffmpeg: false, pandoc: false, imagemagick: false, libreoffice: false, poppler: false, pdfunite: false, pdfsplit: false, qpdf: false })
  const [videoCodecs, setVideoCodecs] = useState<string[]>([])
  const [audioFormats, setAudioFormats] = useState<string[]>([])
  const [videoScalingAvailable, setVideoScalingAvailable] = useState<boolean | null>(null)
  const [operationQueue, setOperationQueue] = useState<OperationQueueItem[]>([])
  const [conversionCatalog, setConversionCatalog] = useState<ConversionCatalogItem[]>([])

  const tr = (key: MessageKey) => t(preferences.language, key)
  const favoriteIds = preferences.favoriteActions ?? []
  const toggleFavorite = (id: string) => updatePreferences({ favoriteActions: favoriteIds.includes(id) ? favoriteIds.filter((favorite) => favorite !== id) : [...favoriteIds, id] })
  useEffect(() => {
    if (section !== 'tools' || !toolCategory) return
    document.getElementById(toolCategory)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setToolCategory(null)
  }, [section, toolCategory])
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (section === 'tools' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        toolSearchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [section])
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    const stops: (() => void)[] = []
    const addStop = (stop: () => void) => { if (disposed) stop(); else stops.push(stop) }
    void listen<string>('flickvert://quick-action', () => { setSection('settings'); setSettingsPage('general') }).then(addStop)
    void listen<OperationQueueItem[]>('flickvert://operation-queue', ({ payload }) => setOperationQueue(payload.slice(0, 100))).then(addStop)
    void listen<{ jobId: string; progress: number }>('flickvert://operation-progress', ({ payload }) => setOperationQueue((queue) => queue.map((item) => item.jobId === payload.jobId ? { ...item, progress: payload.progress } : item))).then(addStop)
    void listen<{ inputPath: string; initialTool: ImageEditTool }>('flickvert://image-editor-open', ({ payload }) => {
      if (typeof payload.inputPath === 'string') { setSection('settings'); setImageEdit(payload) }
    }).then(addStop)
    void listen<string>('flickvert://video-trim-open', ({ payload }) => {
      if (typeof payload === 'string') { setSection('home'); setVideoTrimPath(payload) }
    }).then(addStop)
    void listen<string[]>('flickvert://video-export-preview-open', ({ payload }) => {
      if (Array.isArray(payload) && payload.every((path) => typeof path === 'string')) { setSection('home'); setVideoExportPaths(payload) }
    }).then(addStop)
    void listen<string[]>('flickvert://pdf-merge-open', ({ payload }) => {
      if (Array.isArray(payload) && payload.length >= 2 && payload.every((path) => typeof path === 'string')) { setSection('home'); setPdfMergePaths(payload) }
    }).then(addStop)
    void listen<string>('flickvert://pdf-split-open', ({ payload }) => {
      if (typeof payload === 'string') { setSection('home'); setPdfSplitPath(payload) }
    }).then(addStop)
    void listen<string>('flickvert://pdf-pages-open', ({ payload }) => {
      if (typeof payload === 'string') { setSection('home'); setPdfPagesPath(payload) }
    }).then(addStop)
    void listen<string>('flickvert://video-thumbnail-open', ({ payload }) => {
      if (typeof payload === 'string') { setSection('home'); setVideoThumbnailPath(payload) }
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
    if (isTauri()) {
      void invoke<Engines>('engine_status').then(setEngines).catch(() => {})
      void invoke<ConversionCatalogItem[]>('conversion_catalog').then(setConversionCatalog).catch(() => {})
      void invoke<string[]>('video_codecs').then(setVideoCodecs).catch(() => {})
      void invoke<string[]>('audio_formats').then(setAudioFormats).catch(() => {})
      void invoke<boolean>('video_scaling_available').then(setVideoScalingAvailable).catch(() => setVideoScalingAvailable(false))
    }
  }, [])

  function updatePreferences(patch: Partial<AppSettings>) {
    const next = normalizeSettings({ ...preferences, ...patch })
    setPreferences(next)
    saveSettings(next)
    if (isTauri()) void emit('flickvert://settings-changed', next).catch(() => {})
  }

  function applyDimensionPreset(value: string) {
    setSelectedDimensionPreset(value)
    setPresetSaved(false)
    const preset = sizePresets.find((item) => item.id === value)
      ?? (value.startsWith('custom-') ? preferences.dimensionPresets?.[Number(value.slice(7))] : undefined)
    if (preset) updatePreferences({ width: preset.width, height: preset.height })
  }

  function saveDimensionPreset() {
    const name = presetName.trim()
    if (!name || !preferences.width || !preferences.height) return
    const presets = (preferences.dimensionPresets ?? []).filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase()).slice(-19)
    const next = [...presets, { name, width: preferences.width, height: preferences.height }]
    updatePreferences({ dimensionPresets: next })
    setSelectedDimensionPreset(`custom-${next.length - 1}`)
    setPresetName('')
    setPresetSaved(true)
  }

  function removeDimensionPreset() {
    const index = Number(selectedDimensionPreset.slice(7))
    if (!Number.isInteger(index)) return
    updatePreferences({ dimensionPresets: (preferences.dimensionPresets ?? []).filter((_, presetIndex) => presetIndex !== index) })
    setSelectedDimensionPreset('')
    setPresetSaved(false)
  }

  function exportSettings() {
    const blob = new Blob([createSettingsBackup(preferences)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'flickvert-settings.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function importSettings(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      if (file.size > 128 * 1024) throw new Error('Backup is too large')
      const backup: unknown = JSON.parse(await file.text())
      updatePreferences(restoreSettingsBackup(backup, preferences.outputFolder))
      setSettingsImportError(false)
    } catch { setSettingsImportError(true) }
    event.target.value = ''
  }

  function dismissGuide() {
    setSection('home')
  }

  function openToolCategory(category: string) {
    setToolSearch('')
    setToolCategory(category)
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
    <WindowChrome language={preferences.language}/>
    <AppSidebar
      section={section}
      settingsPage={settingsPage}
      language={preferences.language}
      setSection={setSection}
      setSettingsPage={setSettingsPage}
      tr={tr}
    />

    <main className="main" tabIndex={0}>
      {section === 'home' ? <HomePage
        preferences={preferences}
        engines={engines}
        queue={operationQueue}
        setQueue={setOperationQueue}
        pickError={pickError}
        resultOpenError={resultOpenError}
        setResultOpenError={setResultOpenError}
        tr={tr}
        onChooseFiles={() => void chooseFiles()}
        onExploreTools={() => setSection('tools')}
        onOpenCategory={openToolCategory}
        onOpenKeyboard={() => { setSection('settings'); setSettingsPage('keyboard') }}
        onRevealOutput={(path) => { void invoke('reveal_output_path', { outputPath: path }).catch(() => setResultOpenError(true))}}
      /> : section === 'tools' ? <ToolsPage
        conversionCatalog={conversionCatalog}
        favorites={favoriteIds}
        search={toolSearch}
        searchRef={toolSearchInput}
        engines={engines}
        pickError={pickError}
        tr={tr}
        onSearchChange={setToolSearch}
        onChooseFiles={() => void chooseFiles()}
        onToggleFavorite={toggleFavorite}
      /> : section === 'guide' ? <QuickStartPage
        preferences={preferences}
        tr={tr}
        onHome={dismissGuide}
        onChooseFiles={() => { dismissGuide(); void chooseFiles() }}
      /> : <SettingsView
        settingsPage={settingsPage}
        preferences={preferences}
        tr={tr}
        pickError={pickError}
        shortcutError={shortcutError}
        modifierError={modifierError}
        recordingShortcut={recordingShortcut}
        setRecordingShortcut={setRecordingShortcut}
        setShortcutError={setShortcutError}
        updatePreferences={updatePreferences}
        updateShortcut={updateShortcut}
        updateDragModifier={updateDragModifier}
        setSection={setSection}
        chooseOutputFolder={chooseOutputFolder}
        engines={engines}
        videoCodecs={videoCodecs}
        audioFormats={audioFormats}
        videoScalingAvailable={videoScalingAvailable}
        selectedDimensionPreset={selectedDimensionPreset}
        setSelectedDimensionPreset={setSelectedDimensionPreset}
        applyDimensionPreset={applyDimensionPreset}
        saveDimensionPreset={saveDimensionPreset}
        removeDimensionPreset={removeDimensionPreset}
        presetName={presetName}
        setPresetName={setPresetName}
        presetSaved={presetSaved}
        setPresetSaved={setPresetSaved}
        exportSettings={exportSettings}
        importSettings={importSettings}
        settingsImportInput={settingsImportInput}
        settingsImportError={settingsImportError}
      />}
    </main>
    {imageEdit && <ImageEditor key={imageEdit.inputPath} inputPath={imageEdit.inputPath} initialTool={imageEdit.initialTool} outputFolder={preferences.outputFolder} onClose={() => setImageEdit(null)}/>}
    {videoTrimPath && <VideoTrimEditor key={videoTrimPath} inputPath={videoTrimPath} language={preferences.language} outputFolder={preferences.outputFolder} videoCodec={preferences.videoCodec} videoPreset={preferences.videoPreset} onClose={() => setVideoTrimPath(null)}/>}
    {videoExportPaths && <VideoExportPreview key={videoExportPaths.join('\0')} inputPaths={videoExportPaths} language={preferences.language} outputFolder={preferences.outputFolder} codec={preferences.videoCodec} preset={preferences.videoPreset} height={videoScalingAvailable ? preferences.videoHeight : undefined} onClose={() => setVideoExportPaths(null)}/>}
    {pdfMergePaths && <PdfMergeEditor key={pdfMergePaths.join('\0')} inputPaths={pdfMergePaths} language={preferences.language} outputFolder={preferences.outputFolder} onClose={() => setPdfMergePaths(null)}/>}
    {pdfSplitPath && <PdfSplitEditor key={pdfSplitPath} inputPath={pdfSplitPath} language={preferences.language} outputFolder={preferences.outputFolder} onClose={() => setPdfSplitPath(null)}/>}
    {pdfPagesPath && <PdfPagesEditor key={pdfPagesPath} inputPath={pdfPagesPath} language={preferences.language} outputFolder={preferences.outputFolder} onClose={() => setPdfPagesPath(null)}/>}
    {videoThumbnailPath && <VideoThumbnailEditor key={videoThumbnailPath} inputPath={videoThumbnailPath} language={preferences.language} outputFolder={preferences.outputFolder} videoCodec={preferences.videoCodec} videoPreset={preferences.videoPreset} onClose={() => setVideoThumbnailPath(null)}/>}
  </div>
}
