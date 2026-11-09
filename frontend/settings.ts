export type Language = 'en' | 'ru' | 'zh'
export type Appearance = 'system' | 'light' | 'dark'
export type AccentColor = 'orange' | 'blue' | 'violet' | 'teal' | 'green' | 'rose'
export type VideoPreset = 'small' | 'balanced' | 'high'
export type VideoCodec = 'h264' | 'hevc'
export type VideoHeight = 480 | 720 | 1080
export type AudioExtractionFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav'
export type PdfPageSize = 'source' | 'a4' | 'letter'
export type PdfPageOrientation = 'auto' | 'portrait' | 'landscape'
export type TerminalPreference = 'windows-terminal' | 'powershell'
export type DragModifiers = { convert: 'SHIFT' | 'CTRL' | 'ALT'; tools: 'SHIFT' | 'CTRL' | 'ALT'; actions: 'SHIFT' | 'CTRL' | 'ALT' }
export type DimensionPreset = { name: string; width: number; height: number; quality?: number; format?: AppSettings['format'] }
export type AppSettings = {
  language: Language
  appearance: Appearance
  accent: AccentColor
  quickMenuTheme: 'default' | 'transparent' | 'custom'
  quickMenuBackground: string
  quickMenuSector: string
  quickMenuActive: string
  quickMenuText: string
  quickMenuBackgroundOpacity: number
  quickMenuSectorOpacity: number
  customAccent?: string
  favoriteActions?: string[]
  quality: number
  pdfDpi: number
  pdfPageSize: PdfPageSize
  pdfPageOrientation: PdfPageOrientation
  zipCompressionLevel: number
  width?: number
  height?: number
  dimensionPresets?: DimensionPreset[]
  outputFolder?: string
  format: 'image/png' | 'image/jpeg' | 'image/webp'
  videoPreset: VideoPreset
  videoCodec: VideoCodec
  videoHeight?: VideoHeight
  audioTargetLufs: number
  audioTruePeakDb: number
  audioExtractionFormat: AudioExtractionFormat
  shortcut: string
  terminalPreference: TerminalPreference
  launchAtStartup: boolean
  launchAtStartupConfigured: boolean
  contextMenuEnabled: boolean
  confirmQuitOnClose: boolean
  operationShortcuts: Record<string, string>
  dragModifiers: DragModifiers
}

export const defaultSettings: AppSettings = {
  language: 'en', appearance: 'system', accent: 'orange', quickMenuTheme: 'default', quickMenuBackground: '#F8FAFC', quickMenuSector: '#E2E8F0', quickMenuActive: '#DBEAFE', quickMenuText: '#172033', quickMenuBackgroundOpacity: 94, quickMenuSectorOpacity: 95, quality: 88, pdfDpi: 300, pdfPageSize: 'source', pdfPageOrientation: 'auto', zipCompressionLevel: 6, format: 'image/webp', videoPreset: 'balanced', videoCodec: 'h264', audioTargetLufs: -16, audioTruePeakDb: -1, audioExtractionFormat: 'mp3', shortcut: 'CTRL+ALT+SPACE', terminalPreference: 'windows-terminal', launchAtStartup: true, launchAtStartupConfigured: false, contextMenuEnabled: false, confirmQuitOnClose: false, operationShortcuts: {}, dragModifiers: { convert: 'SHIFT', tools: 'CTRL', actions: 'ALT' },
}

export const accentColors: Record<AccentColor, string> = {
  orange: '#D96C24', blue: '#315FCE', violet: '#7258D7', teal: '#087F78', green: '#27845F', rose: '#BD4F70',
}

export function accentColor(settings: AppSettings): string {
  return settings.customAccent && /^#[0-9a-fA-F]{6}$/.test(settings.customAccent) ? settings.customAccent : accentColors[settings.accent]
}

export function quickMenuThemeValues(theme: AppSettings['quickMenuTheme']): Partial<AppSettings> {
  if (theme === 'transparent') return { quickMenuTheme: theme, quickMenuBackgroundOpacity: 0, quickMenuSectorOpacity: 0 }
  if (theme === 'default') return { quickMenuTheme: theme, quickMenuBackground: defaultSettings.quickMenuBackground, quickMenuSector: defaultSettings.quickMenuSector, quickMenuActive: defaultSettings.quickMenuActive, quickMenuText: defaultSettings.quickMenuText, quickMenuBackgroundOpacity: 94, quickMenuSectorOpacity: 95 }
  return { quickMenuTheme: theme, quickMenuBackgroundOpacity: 94, quickMenuSectorOpacity: 95 }
}

export function resetSettingsSection(section: 'appearance' | 'keyboard' | 'paths'): Partial<AppSettings> {
  if (section === 'appearance') return { appearance: 'system', accent: 'orange', customAccent: undefined, quickMenuTheme: 'default', quickMenuBackground: '#F8FAFC', quickMenuSector: '#E2E8F0', quickMenuActive: '#DBEAFE', quickMenuText: '#172033', quickMenuBackgroundOpacity: 94, quickMenuSectorOpacity: 95 }
  if (section === 'keyboard') return { shortcut: defaultSettings.shortcut, operationShortcuts: {}, dragModifiers: defaultSettings.dragModifiers }
  return { outputFolder: undefined }
}

export function validShortcut(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parts = value.split('+')
  const key = parts.pop()
  const modifiers = parts
  return Boolean(key && modifiers.length && new Set(modifiers).size === modifiers.length && modifiers.every((part) => ['CTRL', 'ALT', 'SHIFT'].includes(part)) && /^(SPACE|[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(key))
}

export function normalizeOperationShortcuts(value: unknown, primaryShortcut: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const used = new Set([primaryShortcut])
  return Object.fromEntries(Object.entries(value).slice(0, 64).filter(([id, shortcut]) => {
    if (!/^[a-z0-9-]{1,64}$/.test(id) || !validShortcut(shortcut) || used.has(shortcut)) return false
    used.add(shortcut)
    return true
  }))
}

export function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return defaultSettings
  const raw = value as Record<string, unknown>
  const rawModifiers = raw.dragModifiers && typeof raw.dragModifiers === 'object' ? raw.dragModifiers as Record<string, unknown> : {}
  const modifierKeys = [rawModifiers.convert, rawModifiers.tools, rawModifiers.actions]
  const validModifiers = modifierKeys.every((key) => key === 'SHIFT' || key === 'CTRL' || key === 'ALT') && new Set(modifierKeys).size === 3
  const validDimension = (v: unknown) => Number.isInteger(v) && Number(v) > 0 && Number(v) <= 32768 ? Number(v) : undefined
  const shortcut = validShortcut(raw.shortcut) ? raw.shortcut : 'CTRL+ALT+SPACE'
  const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
  const opacity = (value: unknown, fallback: number) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100 ? Number(value) : fallback
  const presetNames = new Set<string>()
  const dimensionPresets = Array.isArray(raw.dimensionPresets) ? raw.dimensionPresets.flatMap((preset) => {
    if (!preset || typeof preset !== 'object') return []
    const item = preset as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 32) : ''
    const width = validDimension(item.width)
    const height = validDimension(item.height)
    const key = name.toLocaleLowerCase()
    if (!name || !width || !height || presetNames.has(key)) return []
    presetNames.add(key)
    const quality = Number.isInteger(item.quality) && Number(item.quality) >= 40 && Number(item.quality) <= 100 ? Number(item.quality) : undefined
    const format: AppSettings['format'] | undefined = item.format === 'image/png' || item.format === 'image/jpeg' || item.format === 'image/webp' ? item.format : undefined
    return [{ name, width, height, ...(quality ? { quality } : {}), ...(format ? { format } : {}) }]
  }).slice(0, 20) : []
  return {
    language: raw.language === 'ru' || raw.language === 'zh' ? raw.language : 'en',
    appearance: raw.appearance === 'dark' || raw.appearance === 'light' ? raw.appearance : 'system',
    accent: ['orange', 'blue', 'violet', 'teal', 'green', 'rose'].includes(String(raw.accent)) ? raw.accent as AccentColor : 'orange',
    quickMenuTheme: ['default', 'transparent', 'custom'].includes(String(raw.quickMenuTheme)) ? raw.quickMenuTheme as AppSettings['quickMenuTheme'] : 'default',
    quickMenuBackground: color(raw.quickMenuBackground, defaultSettings.quickMenuBackground), quickMenuSector: color(raw.quickMenuSector, defaultSettings.quickMenuSector), quickMenuActive: color(raw.quickMenuActive, defaultSettings.quickMenuActive), quickMenuText: color(raw.quickMenuText, defaultSettings.quickMenuText),
    quickMenuBackgroundOpacity: raw.quickMenuTheme === 'transparent' ? 0 : opacity(raw.quickMenuBackgroundOpacity, 94), quickMenuSectorOpacity: raw.quickMenuTheme === 'transparent' ? 0 : opacity(raw.quickMenuSectorOpacity, 95),
    ...(typeof raw.customAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.customAccent) ? { customAccent: raw.customAccent } : {}),
    ...(Array.isArray(raw.favoriteActions) ? { favoriteActions: [...new Set(raw.favoriteActions.filter((id): id is string => typeof id === 'string' && /^[a-z0-9-]+$/.test(id)))].slice(0, 100) } : {}),
    quality: Number.isInteger(raw.quality) && Number(raw.quality) >= 40 && Number(raw.quality) <= 100 ? Number(raw.quality) : 88,
    pdfDpi: Number.isInteger(raw.pdfDpi) && Number(raw.pdfDpi) >= 72 && Number(raw.pdfDpi) <= 600 ? Number(raw.pdfDpi) : 300,
    pdfPageSize: raw.pdfPageSize === 'a4' || raw.pdfPageSize === 'letter' ? raw.pdfPageSize : 'source',
    pdfPageOrientation: raw.pdfPageOrientation === 'portrait' || raw.pdfPageOrientation === 'landscape' ? raw.pdfPageOrientation : 'auto',
    zipCompressionLevel: Number.isInteger(raw.zipCompressionLevel) && Number(raw.zipCompressionLevel) >= 1 && Number(raw.zipCompressionLevel) <= 9 ? Number(raw.zipCompressionLevel) : 6,
    format: raw.format === 'image/png' || raw.format === 'image/jpeg' ? raw.format : 'image/webp',
    videoPreset: raw.videoPreset === 'small' || raw.videoPreset === 'high' ? raw.videoPreset : 'balanced',
    videoCodec: raw.videoCodec === 'hevc' ? 'hevc' : 'h264',
    ...(raw.videoHeight === 480 || raw.videoHeight === 720 || raw.videoHeight === 1080 ? { videoHeight: raw.videoHeight } : {}),
    audioTargetLufs: Number.isInteger(raw.audioTargetLufs) && Number(raw.audioTargetLufs) >= -24 && Number(raw.audioTargetLufs) <= -14 ? Number(raw.audioTargetLufs) : -16,
    audioTruePeakDb: Number.isInteger(raw.audioTruePeakDb) && Number(raw.audioTruePeakDb) >= -9 && Number(raw.audioTruePeakDb) <= -1 ? Number(raw.audioTruePeakDb) : -1,
    audioExtractionFormat: ['mp3', 'm4a', 'opus', 'flac', 'wav'].includes(String(raw.audioExtractionFormat)) ? raw.audioExtractionFormat as AudioExtractionFormat : 'mp3',
    shortcut,
    operationShortcuts: normalizeOperationShortcuts(raw.operationShortcuts, shortcut),
    terminalPreference: raw.terminalPreference === 'powershell' ? 'powershell' : 'windows-terminal',
    launchAtStartup: raw.launchAtStartupConfigured === true ? raw.launchAtStartup === true : true,
    launchAtStartupConfigured: raw.launchAtStartupConfigured === true,
    contextMenuEnabled: raw.contextMenuEnabled === true,
    confirmQuitOnClose: raw.confirmQuitOnClose === true,
    dragModifiers: validModifiers ? rawModifiers as DragModifiers : defaultSettings.dragModifiers,
    ...(validDimension(raw.width) ? { width: validDimension(raw.width) } : {}),
    ...(validDimension(raw.height) ? { height: validDimension(raw.height) } : {}),
    ...(dimensionPresets.length ? { dimensionPresets } : {}),
    ...(typeof raw.outputFolder === 'string' && raw.outputFolder.trim() ? { outputFolder: raw.outputFolder.trim() } : {}),
  }
}

export function createSettingsBackup(settings: AppSettings): string {
  const { outputFolder: _outputFolder, ...portableSettings } = normalizeSettings(settings)
  return JSON.stringify({ app: 'FlickVert', version: 1, settings: portableSettings }, null, 2)
}

export function restoreSettingsBackup(value: unknown, outputFolder?: string): AppSettings {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings backup')
  const backup = value as Record<string, unknown>
  if (backup.app !== 'FlickVert' || backup.version !== 1 || !backup.settings || typeof backup.settings !== 'object') throw new Error('Invalid settings backup')
  const settings = backup.settings as Record<string, unknown>
  if (!['language', 'appearance', 'accent', 'quality', 'format', 'shortcut', 'dragModifiers'].every((key) => Object.prototype.hasOwnProperty.call(settings, key))) throw new Error('Incomplete settings backup')
  return normalizeSettings({ ...settings, launchAtStartupConfigured: true, outputFolder })
}

export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem('flickvert-settings')
    if (saved) return normalizeSettings(JSON.parse(saved))
    const oldTheme = localStorage.getItem('flickvert-theme')
    return { ...defaultSettings, appearance: oldTheme === 'dark' ? 'dark' : oldTheme === 'light' ? 'light' : 'system' }
  } catch { return defaultSettings }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem('flickvert-settings', JSON.stringify(normalizeSettings(settings)))
}
