import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePdfPageSelection, pdfSplitOutputPaths } from './pdf-split.ts'

test('PDF page selection accepts individual pages and inclusive ranges', () => {
  assert.deepEqual(parsePdfPageSelection('1, 3-5,8', 10), [1, 3, 4, 5, 8])
  for (const value of ['', '1,', '0', '11', '3-1', '1,,2', '2,2', '1-x']) assert.equal(parsePdfPageSelection(value, 10), null, value)
})

test('PDF split preview names outputs by source stem and page number', () => {
  assert.deepEqual(pdfSplitOutputPaths('C:\\Docs\\annual.report.pdf', [1, 12]), [
    'C:\\Docs\\annual.report-page-1.pdf',
    'C:\\Docs\\annual.report-page-12.pdf',
  ])
  assert.deepEqual(pdfSplitOutputPaths('/docs/report.pdf', [2], '/exports'), ['/exports/report-page-2.pdf'])
})
