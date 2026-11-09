import test from 'node:test'
import assert from 'node:assert/strict'
import { engineGuides } from './engine-guides.ts'

test('engine installation links use trusted project pages and cover combined requirements', () => {
  assert.deepEqual(engineGuides('FFmpeg'), [{ name: 'FFmpeg', url: 'https://ffmpeg.org/download.html' }])
  assert.deepEqual(engineGuides('Poppler + Pandoc'), [
    { name: 'Poppler', url: 'https://poppler.freedesktop.org/' },
    { name: 'Pandoc', url: 'https://pandoc.org/installing.html' },
  ])
  assert.deepEqual(engineGuides('Unknown engine'), [])
})
