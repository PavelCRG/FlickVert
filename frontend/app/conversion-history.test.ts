import test from 'node:test'
import assert from 'node:assert/strict'
import { formatBytes, mergeConversionHistory, normalizeConversionHistory, totalSavedBytes } from './conversion-history.ts'

test('history retains completed conversions only and merges updates without duplicates', () => {
  const done = { id: 'job-1', name: 'photo.jpg', format: 'webp', status: 'done' as const, inputBytes: 4000, outputBytes: 1200, outputPath: 'D:/out/photo.webp' }
  const first = mergeConversionHistory([], [{ ...done, status: 'processing' }, done], 10)
  assert.equal(first.length, 1)
  assert.equal(first[0].completedAt, 10)
  assert.equal(mergeConversionHistory(first, [done], 20).length, 1)
  assert.equal(mergeConversionHistory(first, [{ ...done, outputBytes: 900 }], 30)[0].outputBytes, 900)
})

test('history ignores malformed saved entries and bounds retained results', () => {
  const entries = normalizeConversionHistory([{ id: 'bad', name: 4 }, ...Array.from({ length: 120 }, (_, index) => ({ id: `job-${index}`, name: 'a.png', format: 'png', inputBytes: 10, outputBytes: 8, completedAt: index }))])
  assert.equal(entries.length, 100)
  assert.equal(entries[0].id, 'job-119')
})

test('saved-space total counts only positive differences', () => {
  assert.equal(totalSavedBytes([{ id: 'a', name: 'a', format: 'jpg', inputBytes: 100, outputBytes: 40, completedAt: 1 }, { id: 'b', name: 'b', format: 'png', inputBytes: 50, outputBytes: 70, completedAt: 2 }]), 60)
})

test('formats saved byte counts without losing small values', () => {
  assert.equal(formatBytes(0, 'en'), '0 B')
  assert.match(formatBytes(1536, 'en'), /^1\.5 KB$/)
})
