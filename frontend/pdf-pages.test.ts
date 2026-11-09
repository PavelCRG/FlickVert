import assert from 'node:assert/strict'
import test from 'node:test'
import { movePdfPage, rotatePdfPage, validPdfPageOrder, pdfPagesOutputPath } from './pdf-pages.ts'

test('PDF pages can be reordered without changing the original array', () => {
  const pages = [1, 2, 3, 4]
  assert.deepEqual(movePdfPage(pages, 1, -1), [2, 1, 3, 4])
  assert.deepEqual(movePdfPage(pages, 0, -1), pages)
  assert.deepEqual(movePdfPage(pages, 3, 1), pages)
  assert.deepEqual(pages, [1, 2, 3, 4])
})

test('page rotations advance in 90 degree steps and wrap to upright', () => {
  assert.deepEqual(rotatePdfPage([0, 0, 0], 1, 1), [0, 90, 0])
  assert.deepEqual(rotatePdfPage([0, 270, 0], 1, 1), [0, 0, 0])
  assert.deepEqual(rotatePdfPage([0, 90, 0], 1, -1), [0, 0, 0])
})

test('PDF page order must contain every page exactly once', () => {
  assert.equal(validPdfPageOrder([3, 1, 2], 3), true)
  assert.equal(validPdfPageOrder([1, 2, 2], 3), false)
  assert.equal(validPdfPageOrder([1, 2], 3), false)
  assert.equal(validPdfPageOrder([0, 1, 2], 3), false)
  assert.equal(validPdfPageOrder([1, 2, 4], 3), false)
})

test('PDF page edit output stays in the chosen folder and avoids an existing extension', () => {
  assert.equal(pdfPagesOutputPath('C:\\docs\\report.pdf'), 'C:\\docs\\report-edited.pdf')
  assert.equal(pdfPagesOutputPath('/docs/report.PDF', '/exports/'), '/exports/report-edited.pdf')
  assert.equal(pdfPagesOutputPath('/docs/report'), '/docs/report-edited.pdf')
})
