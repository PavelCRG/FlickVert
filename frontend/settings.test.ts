import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSettings, normalizeOperationShortcuts, defaultSettings, createSettingsBackup, restoreSettingsBackup, resetSettingsSection, quickMenuThemeValues, saveSettings, loadSettings } from './settings.ts'

test('invalid or absent saved settings resolve to safe defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), defaultSettings)
  assert.deepEqual(normalizeSettings({ language: 'xx', appearance: 'custom', quality: 200, width: -1, shortcut: 'bad' }), defaultSettings)
  assert.equal(normalizeSettings({ videoPreset: 'fastest' }).videoPreset, 'balanced')
  assert.equal(normalizeSettings({ videoCodec: 'av1', videoHeight: 4320 }).videoCodec, 'h264')
  assert.equal(normalizeSettings({ videoCodec: 'av1', videoHeight: 4320 }).videoHeight, undefined)
})

test('quick menu theme normalizes colors and opacity and survives settings backups', () => {
  const settings = normalizeSettings({ quickMenuTheme: 'custom', quickMenuBackground: '#123456', quickMenuSector: '#234567', quickMenuActive: '#345678', quickMenuText: '#fefefe', quickMenuBackgroundOpacity: 42, quickMenuSectorOpacity: 67 })
  assert.deepEqual([settings.quickMenuTheme, settings.quickMenuBackground, settings.quickMenuSector, settings.quickMenuActive, settings.quickMenuText, settings.quickMenuBackgroundOpacity, settings.quickMenuSectorOpacity], ['custom', '#123456', '#234567', '#345678', '#fefefe', 42, 67])
  const restored = restoreSettingsBackup(JSON.parse(createSettingsBackup(settings)))
  assert.deepEqual([restored.quickMenuTheme, restored.quickMenuBackground, restored.quickMenuSector, restored.quickMenuActive, restored.quickMenuText, restored.quickMenuBackgroundOpacity, restored.quickMenuSectorOpacity], ['custom', '#123456', '#234567', '#345678', '#fefefe', 42, 67])
  assert.equal(normalizeSettings({}).quickMenuTheme, 'default')
  assert.equal(normalizeSettings({ quickMenuTheme: 'transparent' }).quickMenuTheme, 'transparent')
  const transparent = normalizeSettings({ quickMenuTheme: 'transparent', quickMenuBackgroundOpacity: 60, quickMenuSectorOpacity: 30 })
  assert.deepEqual([transparent.quickMenuBackgroundOpacity, transparent.quickMenuSectorOpacity], [0, 0])
  assert.deepEqual([normalizeSettings({ quickMenuBackground: 'red', quickMenuBackgroundOpacity: 101 }).quickMenuBackground, normalizeSettings({ quickMenuBackgroundOpacity: 101 }).quickMenuBackgroundOpacity], ['#F8FAFC', 94])
})

test('quick menu theme presets select default or transparent values', () => {
  assert.deepEqual(quickMenuThemeValues('transparent'), { quickMenuTheme: 'transparent', quickMenuBackgroundOpacity: 0, quickMenuSectorOpacity: 0 })
  assert.deepEqual(quickMenuThemeValues('default'), { quickMenuTheme: 'default', quickMenuBackground: '#F8FAFC', quickMenuSector: '#E2E8F0', quickMenuActive: '#DBEAFE', quickMenuText: '#172033', quickMenuBackgroundOpacity: 94, quickMenuSectorOpacity: 95 })
  assert.deepEqual(quickMenuThemeValues('custom'), { quickMenuTheme: 'custom', quickMenuBackgroundOpacity: 94, quickMenuSectorOpacity: 95 })
})

test('quick menu theme preferences persist through the existing local settings store', () => {
  const original = globalThis.localStorage
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  try {
    const expected = normalizeSettings({ quickMenuTheme: 'custom', quickMenuText: '#aabbcc', quickMenuBackgroundOpacity: 37 })
    saveSettings(expected)
    assert.deepEqual(loadSettings(), expected)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
    else delete (globalThis as { localStorage?: Storage }).localStorage
  }
})

test('video codec, resolution, and quality preset are retained in settings backup', () => {
  const settings = normalizeSettings({ videoPreset: 'high', videoCodec: 'hevc', videoHeight: 720 })
  assert.equal(settings.videoPreset, 'high')
  const restored = restoreSettingsBackup(JSON.parse(createSettingsBackup(settings)))
  assert.equal(restored.videoPreset, 'high')
  assert.equal(restored.videoCodec, 'hevc')
  assert.equal(restored.videoHeight, 720)
})

test('audio normalization settings stay within supported bounds and are backed up', () => {
  assert.deepEqual(normalizeSettings({ audioTargetLufs: -30, audioTruePeakDb: 1 }), { ...defaultSettings })
  const settings = normalizeSettings({ audioTargetLufs: -18, audioTruePeakDb: -3 })
  assert.equal(settings.audioTargetLufs, -18)
  assert.equal(settings.audioTruePeakDb, -3)
  const restored = restoreSettingsBackup(JSON.parse(createSettingsBackup(settings)))
  assert.equal(restored.audioTargetLufs, -18)
  assert.equal(restored.audioTruePeakDb, -3)
})

test('audio extraction format defaults safely and is retained in settings backup', () => {
  assert.equal(normalizeSettings({ audioExtractionFormat: 'unsupported' }).audioExtractionFormat, 'mp3')
  const settings = normalizeSettings({ audioExtractionFormat: 'opus' })
  assert.equal(settings.audioExtractionFormat, 'opus')
  assert.equal(restoreSettingsBackup(JSON.parse(createSettingsBackup(settings))).audioExtractionFormat, 'opus')
})

test('PDF export DPI stays within safe bounds and is backed up', () => {
  assert.equal(normalizeSettings({ pdfDpi: 20 }).pdfDpi, 300)
  assert.equal(normalizeSettings({ pdfDpi: 900 }).pdfDpi, 300)
  const settings = normalizeSettings({ pdfDpi: 450 })
  assert.equal(settings.pdfDpi, 450)
  assert.equal(restoreSettingsBackup(JSON.parse(createSettingsBackup(settings))).pdfDpi, 450)
})

test('PDF page size and orientation are validated and backed up', () => {
  assert.deepEqual(normalizeSettings({ pdfPageSize: 'invalid', pdfPageOrientation: 'sideways' }), defaultSettings)
  const settings = normalizeSettings({ pdfPageSize: 'letter', pdfPageOrientation: 'landscape' })
  assert.equal(settings.pdfPageSize, 'letter')
  assert.equal(settings.pdfPageOrientation, 'landscape')
  const restored = restoreSettingsBackup(JSON.parse(createSettingsBackup(settings)))
  assert.equal(restored.pdfPageSize, 'letter')
  assert.equal(restored.pdfPageOrientation, 'landscape')
})

test('ZIP compression level is bounded and retained in settings backups', () => {
  assert.equal(normalizeSettings({ zipCompressionLevel: 12 }).zipCompressionLevel, 6)
  const settings = normalizeSettings({ zipCompressionLevel: 2 })
  assert.equal(settings.zipCompressionLevel, 2)
  assert.equal(restoreSettingsBackup(JSON.parse(createSettingsBackup(settings))).zipCompressionLevel, 2)
})

test('valid settings retain supported preferences', () => {
  assert.deepEqual(normalizeSettings({ language: 'ru', appearance: 'dark', quality: 75, width: 1200, height: 900, format: 'image/jpeg', shortcut: 'CTRL+SHIFT+SPACE', outputFolder: 'D:/Photos' }), {
    language: 'ru', appearance: 'dark', accent: 'orange', quickMenuTheme: 'default', quickMenuBackground: '#F8FAFC', quickMenuSector: '#E2E8F0', quickMenuActive: '#DBEAFE', quickMenuText: '#172033', quickMenuBackgroundOpacity: 94, quickMenuSectorOpacity: 95, quality: 75, pdfDpi: 300, pdfPageSize: 'source', pdfPageOrientation: 'auto', zipCompressionLevel: 6, width: 1200, height: 900, format: 'image/jpeg', videoPreset: 'balanced', videoCodec: 'h264', audioTargetLufs: -16, audioTruePeakDb: -1, audioExtractionFormat: 'mp3', shortcut: 'CTRL+SHIFT+SPACE', operationShortcuts: {}, terminalPreference: 'windows-terminal', launchAtStartup: true, launchAtStartupConfigured: false, contextMenuEnabled: false, confirmQuitOnClose: false, dragModifiers: { convert: 'SHIFT', tools: 'CTRL', actions: 'ALT' }, outputFolder: 'D:/Photos',
  })
})

test('preferred terminal is validated and included in settings backups', () => {
  assert.equal(normalizeSettings({ terminalPreference: 'unknown' }).terminalPreference, 'windows-terminal')
  const settings = normalizeSettings({ terminalPreference: 'powershell' })
  assert.equal(restoreSettingsBackup(JSON.parse(createSettingsBackup(settings))).terminalPreference, 'powershell')
})

test('startup is enabled for new and legacy settings, while an explicit opt-out survives backups', () => {
  assert.equal(defaultSettings.launchAtStartup, true)
  assert.equal(normalizeSettings({ launchAtStartup: false }).launchAtStartup, true)
  assert.equal(normalizeSettings({ launchAtStartup: 'false' }).launchAtStartup, true)
  const settings = normalizeSettings({ launchAtStartup: false, launchAtStartupConfigured: true })
  assert.equal(settings.launchAtStartup, false)
  assert.equal(restoreSettingsBackup(JSON.parse(createSettingsBackup(settings))).launchAtStartup, false)
})

test('context menu integration defaults off and is retained in settings backups', () => {
  assert.equal(normalizeSettings({ contextMenuEnabled: 'true' }).contextMenuEnabled, false)
  const settings = normalizeSettings({ contextMenuEnabled: true })
  assert.equal(restoreSettingsBackup(JSON.parse(createSettingsBackup(settings))).contextMenuEnabled, true)
})

test('confirmed quit on close defaults off and is retained in settings backups', () => {
  assert.equal(defaultSettings.confirmQuitOnClose, false)
  const settings = normalizeSettings({ confirmQuitOnClose: true })
  assert.equal(restoreSettingsBackup(JSON.parse(createSettingsBackup(settings))).confirmQuitOnClose, true)
})

test('operation shortcut assignments reject malformed keys and collisions', () => {
  assert.deepEqual(normalizeOperationShortcuts({ resize: 'CTRL+ALT+R', rotate: 'CTRL+ALT+R', grayscale: 'CTRL+ALT+G', bad: 'CTRL+CTRL+R', 'not valid': 'CTRL+ALT+B' }, 'CTRL+ALT+SPACE'), {
    resize: 'CTRL+ALT+R', grayscale: 'CTRL+ALT+G',
  })
  assert.deepEqual(normalizeOperationShortcuts({ square: 'CTRL+ALT+SPACE' }, 'CTRL+ALT+SPACE'), {})
})

test('missing or invalid accent preferences default to orange', () => {
  assert.equal(normalizeSettings(undefined).accent, 'orange')
  assert.equal(normalizeSettings({ accent: 'chartreuse' }).accent, 'orange')
})

test('every supported accent preference is retained', () => {
  for (const accent of ['orange', 'blue', 'violet', 'teal', 'green', 'rose']) {
    assert.equal(normalizeSettings({ accent }).accent, accent)
  }
})

test('favorite action ids are deduplicated and malformed values are ignored', () => {
  assert.deepEqual(normalizeSettings({ favoriteActions: ['resize', 'resize', '../x', 3, 'compress-audio'] }).favoriteActions, ['resize', 'compress-audio'])
})

test('custom dimension presets are validated, deduplicated, and bounded', () => {
  assert.deepEqual(normalizeSettings({ dimensionPresets: [
    { name: '  Portrait  ', width: 1080, height: 1920 },
    { name: 'portrait', width: 720, height: 1280 },
    { name: 'Invalid', width: 0, height: 100 },
    { name: 'Missing height', width: 800 },
  ] }).dimensionPresets, [{ name: 'Portrait', width: 1080, height: 1920 }])
  assert.equal(normalizeSettings({ dimensionPresets: Array.from({ length: 25 }, (_, index) => ({ name: `Preset ${index}`, width: 100 + index, height: 200 + index })) }).dimensionPresets?.length, 20)
})

test('custom presets retain bounded quality and supported output format', () => {
  const preset = normalizeSettings({ dimensionPresets: [{ name: 'Web', width: 1600, height: 900, quality: 76, format: 'image/jpeg' }] }).dimensionPresets?.[0]
  assert.deepEqual(preset, { name: 'Web', width: 1600, height: 900, quality: 76, format: 'image/jpeg' })
  const invalid = normalizeSettings({ dimensionPresets: [{ name: 'Bad', width: 1600, height: 900, quality: 120, format: 'exe' }] }).dimensionPresets?.[0]
  assert.deepEqual(invalid, { name: 'Bad', width: 1600, height: 900 })
})

test('settings backups exclude local paths and restore valid preferences', () => {
  const settings = { ...defaultSettings, outputFolder: 'C:/Users/Pavel/Private' }
  const backup = JSON.parse(createSettingsBackup(settings))
  assert.equal(JSON.stringify(backup).includes('Private'), false)
  assert.deepEqual(restoreSettingsBackup(backup, 'D:/Local'), { ...defaultSettings, launchAtStartupConfigured: true, outputFolder: 'D:/Local' })
})

test('settings backups retain custom dimension presets but exclude output paths', () => {
  const settings = { ...defaultSettings, outputFolder: 'C:/Private', dimensionPresets: [{ name: 'Story', width: 1080, height: 1920 }] }
  const backup = JSON.parse(createSettingsBackup(settings))
  assert.equal(JSON.stringify(backup).includes('Private'), false)
  assert.deepEqual(restoreSettingsBackup(backup).dimensionPresets, settings.dimensionPresets)
})

test('settings backup import rejects unrelated and incomplete JSON', () => {
  assert.throws(() => restoreSettingsBackup({ settings: {} }))
  assert.throws(() => restoreSettingsBackup({ app: 'FlickVert', version: 1, settings: { language: 'en' } }))
})

test('section resets change only their own preferences', () => {
  const current = normalizeSettings({ appearance: 'dark', accent: 'teal', customAccent: '#112233', shortcut: 'CTRL+SHIFT+SPACE', outputFolder: 'D:/Files' })
  const appearance = normalizeSettings({ ...current, ...resetSettingsSection('appearance') })
  assert.equal(appearance.appearance, 'system')
  assert.equal(appearance.accent, 'orange')
  assert.equal(appearance.customAccent, undefined)
  assert.equal(appearance.outputFolder, current.outputFolder)
  assert.deepEqual(normalizeSettings({ ...current, ...resetSettingsSection('keyboard') }), { ...current, shortcut: defaultSettings.shortcut, operationShortcuts: {}, dragModifiers: defaultSettings.dragModifiers })
  assert.equal(normalizeSettings({ ...current, ...resetSettingsSection('paths') }).outputFolder, undefined)
})
