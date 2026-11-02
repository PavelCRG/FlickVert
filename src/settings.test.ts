import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSettings, defaultSettings } from './settings.ts'

test('invalid or absent saved settings resolve to safe defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), defaultSettings)
  assert.deepEqual(normalizeSettings({ language: 'xx', appearance: 'custom', quality: 200, width: -1, shortcut: 'bad' }), defaultSettings)
})

test('valid settings retain supported preferences', () => {
  assert.deepEqual(normalizeSettings({ language: 'ru', appearance: 'dark', quality: 75, width: 1200, height: 900, format: 'image/jpeg', shortcut: 'CTRL+SHIFT+SPACE', outputFolder: 'D:/Photos' }), {
    language: 'ru', appearance: 'dark', accent: 'blue', quality: 75, width: 1200, height: 900, format: 'image/jpeg', shortcut: 'CTRL+SHIFT+SPACE', dragModifiers: { convert: 'SHIFT', tools: 'CTRL', actions: 'ALT' }, outputFolder: 'D:/Photos',
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
