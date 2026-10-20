import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSettings, defaultSettings } from './settings.ts'

test('invalid or absent saved settings resolve to safe defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), defaultSettings)
  assert.deepEqual(normalizeSettings({ language: 'xx', appearance: 'custom', quality: 200, width: -1, shortcut: 'bad' }), defaultSettings)
})

test('valid settings retain supported preferences', () => {
  assert.deepEqual(normalizeSettings({ language: 'ru', appearance: 'dark', quality: 75, width: 1200, height: 900, format: 'image/jpeg', shortcut: 'Ctrl+Alt+Space' }), {
    language: 'ru', appearance: 'dark', quality: 75, width: 1200, height: 900, format: 'image/jpeg', shortcut: 'Ctrl+Alt+Space',
  })
})
