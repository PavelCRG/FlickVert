import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { normalizeSelection, selectionToPixels } from './image-editor.ts'

test('normalizes a reverse drag and clamps it to the image', () => {
  assert.deepEqual(normalizeSelection([1.2, 0.8], [0.25, -0.2]), { x: 0.25, y: 0, width: 0.75, height: 0.8 })
})

test('maps a normalized selection to inclusive pixel bounds', () => {
  assert.deepEqual(selectionToPixels({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, 100, 50), { x: 10, y: 10, width: 30, height: 20 })
  assert.equal(selectionToPixels({ x: 0.5, y: 0, width: 0, height: 0.5 }, 100, 50), null)
})
