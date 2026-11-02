export type Language = 'en' | 'ru' | 'zh'
export type Appearance = 'system' | 'light' | 'dark'
export type AccentColor = 'blue' | 'violet' | 'teal' | 'green' | 'rose'
export type DragModifiers = { convert: 'SHIFT' | 'CTRL' | 'ALT'; tools: 'SHIFT' | 'CTRL' | 'ALT'; actions: 'SHIFT' | 'CTRL' | 'ALT' }
export type AppSettings = {
  language: Language
  appearance: Appearance
  accent: AccentColor
  customAccent?: string
  quality: number
  width?: number
  height?: number
  outputFolder?: string
  format: 'image/png' | 'image/jpeg' | 'image/webp'
  shortcut: string
  dragModifiers: DragModifiers
}

export const defaultSettings: AppSettings = {
  language: 'en', appearance: 'system', accent: 'blue', quality: 88, format: 'image/webp', shortcut: 'CTRL+ALT+SPACE', dragModifiers: { convert: 'SHIFT', tools: 'CTRL', actions: 'ALT' },
}

export const accentColors: Record<AccentColor, string> = {
  blue: '#315FCE', violet: '#7258D7', teal: '#087F78', green: '#27845F', rose: '#BD4F70',
}

export function accentColor(settings: AppSettings): string {
  return settings.customAccent && /^#[0-9a-fA-F]{6}$/.test(settings.customAccent) ? settings.customAccent : accentColors[settings.accent]
}

export function validShortcut(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parts = value.split('+')
  const key = parts.pop()
  const modifiers = parts
  return Boolean(key && modifiers.length && new Set(modifiers).size === modifiers.length && modifiers.every((part) => ['CTRL', 'ALT', 'SHIFT'].includes(part)) && /^(SPACE|[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(key))
}

export function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return defaultSettings
  const raw = value as Record<string, unknown>
  const rawModifiers = raw.dragModifiers && typeof raw.dragModifiers === 'object' ? raw.dragModifiers as Record<string, unknown> : {}
  const modifierKeys = [rawModifiers.convert, rawModifiers.tools, rawModifiers.actions]
  const validModifiers = modifierKeys.every((key) => key === 'SHIFT' || key === 'CTRL' || key === 'ALT') && new Set(modifierKeys).size === 3
  const validDimension = (v: unknown) => Number.isInteger(v) && Number(v) > 0 && Number(v) <= 32768 ? Number(v) : undefined
  return {
    language: raw.language === 'ru' || raw.language === 'zh' ? raw.language : 'en',
    appearance: raw.appearance === 'dark' || raw.appearance === 'light' ? raw.appearance : 'system',
    accent: ['blue', 'violet', 'teal', 'green', 'rose'].includes(String(raw.accent)) ? raw.accent as AccentColor : 'blue',
    ...(typeof raw.customAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.customAccent) ? { customAccent: raw.customAccent } : {}),
    quality: Number.isInteger(raw.quality) && Number(raw.quality) >= 40 && Number(raw.quality) <= 100 ? Number(raw.quality) : 88,
    format: raw.format === 'image/png' || raw.format === 'image/jpeg' ? raw.format : 'image/webp',
    shortcut: validShortcut(raw.shortcut) ? raw.shortcut : 'CTRL+ALT+SPACE',
    dragModifiers: validModifiers ? rawModifiers as DragModifiers : defaultSettings.dragModifiers,
    ...(validDimension(raw.width) ? { width: validDimension(raw.width) } : {}),
    ...(validDimension(raw.height) ? { height: validDimension(raw.height) } : {}),
    ...(typeof raw.outputFolder === 'string' && raw.outputFolder.trim() ? { outputFolder: raw.outputFolder.trim() } : {}),
  }
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
