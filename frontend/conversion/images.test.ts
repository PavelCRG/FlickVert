import test from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin, normalizeImageOptions } from './images.ts'

test('normalizes invalid image options and clamps quality', () => {
  assert.deepEqual(normalizeImageOptions({ format: 'image/webp', quality: 120, width: 0, height: -2 }), { format: 'image/webp', quality: 100 })
  assert.deepEqual(normalizeImageOptions({ format: 'image/gif', quality: 20, width: 800, height: 600 }), { format: 'image/webp', quality: 40, width: 800, height: 600 })
})

test('fits dimensions inside bounds without changing aspect ratio or upscaling', () => {
  assert.deepEqual(fitWithin(4000, 2000, 1000, 1000), { width: 1000, height: 500 })
  assert.deepEqual(fitWithin(2000, 4000, 1000, 1000), { width: 500, height: 1000 })
  assert.deepEqual(fitWithin(800, 600, 1000, 1000), { width: 800, height: 600 })
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
})
