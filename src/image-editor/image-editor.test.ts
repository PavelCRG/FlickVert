import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { normalizeSelection, normalizeSelectionWithAspect, pixelAspectRatio, selectionToPixels } from './image-editor.ts'
import { checkpointDraft, redoDraft, undoDraft } from './draft-history.ts'
import { editorOutputExtension, formatImageSize } from './image-compression.ts'

test('normalizes a reverse drag and clamps it to the image', () => {
  assert.deepEqual(normalizeSelection([1.2, 0.8], [0.25, -0.2]), { x: 0.25, y: 0, width: 0.75, height: 0.8 })
})

test('maps a normalized selection to inclusive pixel bounds', () => {
  assert.deepEqual(selectionToPixels({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, 100, 50), { x: 10, y: 10, width: 30, height: 20 })
  assert.equal(selectionToPixels({ x: 0.5, y: 0, width: 0, height: 0.5 }, 100, 50), null)
})

test('reports the reduced aspect ratio of actual output pixels', () => {
  assert.equal(pixelAspectRatio(1920, 1080), '16:9')
  assert.equal(pixelAspectRatio(1200, 800), '3:2')
  assert.equal(pixelAspectRatio(0, 800), '')
})

test('keeps fixed crop ratios in image pixels and clamps reverse drags to bounds', () => {
  const wide = normalizeSelectionWithAspect([0.2, 0.2], [0.8, 0.8], 2, 16 / 9)
  assert.ok(Math.abs((wide.width * 2) / wide.height - 16 / 9) < 1e-9)
  const reverse = normalizeSelectionWithAspect([0.9, 0.9], [0.1, 0.2], 1, 1)
  assert.ok(Math.abs(reverse.width - reverse.height) < 1e-9)
  assert.ok(reverse.x >= 0 && reverse.y >= 0 && reverse.x + reverse.width <= 1 && reverse.y + reverse.height <= 1)
})

test('draft undo and redo restore snapshots and discard redo after a new edit', () => {
  const initial = { brightness: 100 }
  const edited = { brightness: 130 }
  const second = { brightness: 150 }
  const firstHistory = checkpointDraft({ past: [], future: [] }, initial)
  const secondHistory = checkpointDraft(firstHistory, edited)
  const undone = undoDraft(secondHistory, second)
  assert.equal(undone?.current, edited)
  const redone = redoDraft(undone!.history, undone!.current)
  assert.equal(redone?.current, second)
  assert.deepEqual(checkpointDraft(redone!.history, { brightness: 180 }).future, [])
  assert.equal(undoDraft({ past: [], future: [] }, initial), null)
})

test('compression format and byte estimates stay consistent', () => {
  assert.equal(editorOutputExtension('image/jpeg'), 'jpg')
  assert.equal(editorOutputExtension('image/png'), 'png')
  assert.equal(editorOutputExtension('image/webp'), 'webp')
  assert.equal(formatImageSize(850), '850 B')
  assert.equal(formatImageSize(1536), '1.5 KB')
  assert.equal(formatImageSize(2 * 1024 * 1024), '2.0 MB')
  assert.equal(formatImageSize(Number.NaN), '—')
})
