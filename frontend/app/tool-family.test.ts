import test from 'node:test'
import assert from 'node:assert/strict'
import { conversionMatchesFamily } from './tool-family.ts'

test('conversion catalog filters rows by their input family', () => {
  assert.equal(conversionMatchesFamily('Images and PDFs', ['png', 'jpg'], 'images'), true)
  assert.equal(conversionMatchesFamily('Images and PDFs', ['pdf'], 'pdf'), true)
  assert.equal(conversionMatchesFamily('PDF documents', ['pdf'], 'pdf'), true)
  assert.equal(conversionMatchesFamily('Documents', ['docx'], 'documents'), true)
  assert.equal(conversionMatchesFamily('Subtitles', ['srt'], 'media'), true)
  assert.equal(conversionMatchesFamily('Audio', ['flac'], 'media'), true)
  assert.equal(conversionMatchesFamily('Audio and video', ['mp4'], 'media'), true)
  assert.equal(conversionMatchesFamily('Files and archives', ['zip'], 'files'), true)
  assert.equal(conversionMatchesFamily('Images and PDFs', ['png'], 'all'), true)
  assert.equal(conversionMatchesFamily('Documents', ['docx'], 'media'), false)
})
