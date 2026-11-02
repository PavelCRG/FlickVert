import test from 'node:test'
import assert from 'node:assert/strict'
import { pdfPageLayout } from './pdf-page-layout.ts'

test('fits source images inside selected PDF page size and orientation', () => {
  const page = pdfPageLayout(1600, 900, 'a4', 'portrait')
  assert.equal(page.pageWidth, 595.28)
  assert.equal(page.pageHeight, 841.89)
  assert.ok(page.imageWidth <= page.pageWidth && page.imageHeight <= page.pageHeight)
  assert.ok(page.x >= 0 && page.y >= 0)
})

test('automatic orientation follows the image and landscape can be selected', () => {
  assert.ok(pdfPageLayout(1200, 800, 'letter', 'auto').pageWidth > pdfPageLayout(1200, 800, 'letter', 'auto').pageHeight)
  assert.ok(pdfPageLayout(800, 1200, 'a4', 'landscape').pageWidth > pdfPageLayout(800, 1200, 'a4', 'landscape').pageHeight)
})
