import test from 'node:test'
import assert from 'node:assert/strict'
import { movePdfFile, pdfMergeOutputPath } from './pdf-merge.ts'

test('PDF merge order can move adjacent files without changing the source list', () => {
  const files = ['one.pdf', 'two.pdf', 'three.pdf']
  assert.deepEqual(movePdfFile(files, 1, -1), ['two.pdf', 'one.pdf', 'three.pdf'])
  assert.deepEqual(movePdfFile(files, 1, 1), ['one.pdf', 'three.pdf', 'two.pdf'])
  assert.deepEqual(movePdfFile(files, 0, -1), files)
  assert.deepEqual(files, ['one.pdf', 'two.pdf', 'three.pdf'])
})

test('PDF merge preview uses the first file name and selected output folder', () => {
  assert.equal(pdfMergeOutputPath(['C:\\Docs\\annual.report.pdf', 'D:\\Other\\notes.pdf']), 'C:\\Docs\\annual.report-merged.pdf')
  assert.equal(pdfMergeOutputPath(['/docs/report.pdf', '/docs/notes.pdf'], '/exports'), '/exports/report-merged.pdf')
})
