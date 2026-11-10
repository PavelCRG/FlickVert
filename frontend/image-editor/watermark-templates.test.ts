import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWatermarkTemplates, removeWatermarkTemplate, saveWatermarkTemplate } from './watermark-templates.ts'

test('watermark text templates stay unique, bounded, and removable', () => {
  assert.deepEqual(normalizeWatermarkTemplates([' Brand ', 'brand', '', 4]), ['Brand'])
  assert.deepEqual(saveWatermarkTemplate(['Brand'], '  © Example  '), ['Brand', '© Example'])
  assert.deepEqual(saveWatermarkTemplate(['Brand'], ' brand '), ['brand'])
  assert.deepEqual(removeWatermarkTemplate(['Brand', '© Example'], 'Brand'), ['© Example'])
  assert.equal(normalizeWatermarkTemplates(Array.from({ length: 20 }, (_, index) => `Template ${index}`)).length, 12)
  assert.equal(normalizeWatermarkTemplates(['x'.repeat(400)])[0].length, 300)
})
