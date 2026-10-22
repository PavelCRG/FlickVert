export type Language = 'en' | 'ru' | 'zh'
export type Appearance = 'system' | 'light' | 'dark'
export type AppSettings = {
  language: Language
  appearance: Appearance
  quality: number
  width?: number
  height?: number
  format: 'image/png' | 'image/jpeg' | 'image/webp'
  shortcut: string
}

export const defaultSettings: AppSettings = {
  language: 'en', appearance: 'system', quality: 88, format: 'image/webp', shortcut: 'CTRL+ALT+SPACE',
}

export function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return defaultSettings
  const raw = value as Record<string, unknown>
  const validDimension = (v: unknown) => Number.isInteger(v) && Number(v) > 0 && Number(v) <= 32768 ? Number(v) : undefined
  return {
    language: raw.language === 'ru' || raw.language === 'zh' ? raw.language : 'en',
    appearance: raw.appearance === 'dark' || raw.appearance === 'light' ? raw.appearance : 'system',
    quality: Number.isInteger(raw.quality) && Number(raw.quality) >= 40 && Number(raw.quality) <= 100 ? Number(raw.quality) : 88,
    format: raw.format === 'image/png' || raw.format === 'image/jpeg' ? raw.format : 'image/webp',
    shortcut: ['CTRL+ALT+SPACE', 'CTRL+SHIFT+SPACE', 'ALT+SHIFT+SPACE'].includes(String(raw.shortcut)) ? String(raw.shortcut) : 'CTRL+ALT+SPACE',
    ...(validDimension(raw.width) ? { width: validDimension(raw.width) } : {}),
    ...(validDimension(raw.height) ? { height: validDimension(raw.height) } : {}),
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
