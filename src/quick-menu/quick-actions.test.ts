import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { canRunFileAction, canRunSelectedTool, canRunWheelTool, canUseNativeImagePath } from './quick-actions.ts'

test('routes selected-file tools even when the wheel was opened by shortcut', () => {
  assert.equal(canRunSelectedTool('resize', ['resize', 'rotate'], 1), true)
  assert.equal(canRunSelectedTool('resize', ['resize', 'rotate'], 0), false)
  assert.equal(canRunSelectedTool('settings', ['resize', 'rotate'], 1), false)
})

test('wheel disables image actions with invalid selection size or PDF limits', () => {
  const limit = 32 * 1024 * 1024
  assert.equal(canRunWheelTool('image-editor', 1, 1), true)
  assert.equal(canRunWheelTool('image-editor', 2, 1), false)
  assert.equal(canRunWheelTool('images-to-pdf', 100, limit), true)
  assert.equal(canRunWheelTool('images-to-pdf', 101, 1), false)
  assert.equal(canRunWheelTool('images-to-pdf', 1, limit + 1), false)
  assert.equal(canRunWheelTool('resize', 1, -1), false)
  assert.equal(canRunWheelTool('resize', 0, 0), false)
})

test('wheel only runs file actions that support the selected file set', () => {
  assert.equal(canRunFileAction('create-zip', [{ extension: 'png' }, { extension: 'zip' }]), true)
  assert.equal(canRunFileAction('extract-zip', [{ extension: 'zip' }]), true)
  assert.equal(canRunFileAction('extract-zip', [{ extension: 'png' }]), false)
  assert.equal(canRunFileAction('reveal', [{ extension: 'png' }, { extension: 'jpg' }]), false)
  assert.equal(canRunFileAction('move-to-folder', []), false)
})

test('native image path only handles formats that preserve alpha and supported fallbacks', () => {
  assert.equal(canUseNativeImagePath('png', 'png', true), true)
  assert.equal(canUseNativeImagePath('jpg', 'jpg', true), true)
  assert.equal(canUseNativeImagePath('png', 'jpg', true), false)
  assert.equal(canUseNativeImagePath('svg', 'png', true), false)
  assert.equal(canUseNativeImagePath('jpg', 'png', false), false)
})
