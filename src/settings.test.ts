import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSettings, defaultSettings, createSettingsBackup, restoreSettingsBackup } from './settings.ts'

test('invalid or absent saved settings resolve to safe defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), defaultSettings)
  assert.deepEqual(normalizeSettings({ language: 'xx', appearance: 'custom', quality: 200, width: -1, shortcut: 'bad' }), defaultSettings)
  assert.equal(normalizeSettings({ videoPreset: 'fastest' }).videoPreset, 'balanced')
  assert.equal(normalizeSettings({ videoCodec: 'av1', videoHeight: 4320 }).videoCodec, 'h264')
  assert.equal(normalizeSettings({ videoCodec: 'av1', videoHeight: 4320 }).videoHeight, undefined)
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

test('valid settings retain supported preferences', () => {
  assert.deepEqual(normalizeSettings({ language: 'ru', appearance: 'dark', quality: 75, width: 1200, height: 900, format: 'image/jpeg', shortcut: 'CTRL+SHIFT+SPACE', outputFolder: 'D:/Photos' }), {
    language: 'ru', appearance: 'dark', accent: 'blue', quality: 75, width: 1200, height: 900, format: 'image/jpeg', videoPreset: 'balanced', videoCodec: 'h264', audioTargetLufs: -16, audioTruePeakDb: -1, audioExtractionFormat: 'mp3', shortcut: 'CTRL+SHIFT+SPACE', dragModifiers: { convert: 'SHIFT', tools: 'CTRL', actions: 'ALT' }, outputFolder: 'D:/Photos',
  })
})

test('missing or invalid accent preferences default to blue', () => {
  assert.equal(normalizeSettings(undefined).accent, 'blue')
  assert.equal(normalizeSettings({ accent: 'chartreuse' }).accent, 'blue')
})

test('every supported accent preference is retained', () => {
  for (const accent of ['blue', 'violet', 'teal', 'green', 'rose']) {
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

test('settings backups exclude local paths and restore valid preferences', () => {
  const settings = { ...defaultSettings, outputFolder: 'C:/Users/Pavel/Private' }
  const backup = JSON.parse(createSettingsBackup(settings))
  assert.equal(JSON.stringify(backup).includes('Private'), false)
  assert.deepEqual(restoreSettingsBackup(backup, 'D:/Local'), { ...defaultSettings, outputFolder: 'D:/Local' })
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
