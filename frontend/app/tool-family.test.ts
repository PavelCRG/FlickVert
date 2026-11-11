import test from 'node:test'
import assert from 'node:assert/strict'
import { conversionMatchesFamily } from './tool-family.ts'

test('conversion catalog filters rows by their input family', () => {
  assert.equal(conversionMatchesFamily('Images and PDFs', ['png', 'jpg'], 'images'), true)
  assert.equal(conversionMatchesFamily('Images and PDFs', ['pdf'], 'pdf'), true)
  assert.equal(conversionMatchesFamily('PDF documents', ['pdf'], 'pdf'), true)
  assert.equal(conversionMatchesFamily('Documents', ['docx'], 'documents'), true)
  assert.equal(conversionMatchesFamily('Subtitles', ['srt'], 'subtitles'), true)
  assert.equal(conversionMatchesFamily('Audio', ['flac'], 'audio'), true)
  assert.equal(conversionMatchesFamily('Audio and video', ['mp4'], 'video'), true)
  assert.equal(conversionMatchesFamily('Files and archives', ['zip'], 'archives'), true)
  assert.equal(conversionMatchesFamily('Images and PDFs', ['png'], 'all'), true)
  assert.equal(conversionMatchesFamily('Documents', ['docx'], 'video'), false)
})

test('conversion catalog separates the file families shown in the category bar', () => {
  assert.equal(conversionMatchesFamily('Audio and video', ['mp4'], 'video'), true)
  assert.equal(conversionMatchesFamily('Audio and video', ['mp3'], 'audio'), true)
  assert.equal(conversionMatchesFamily('Documents', ['pptx'], 'slides'), true)
  assert.equal(conversionMatchesFamily('Documents', ['xlsx'], 'spreadsheets'), true)
  assert.equal(conversionMatchesFamily('Documents', ['epub'], 'epub'), true)
  assert.equal(conversionMatchesFamily('Audio and video', ['vtt'], 'subtitles'), true)
  assert.equal(conversionMatchesFamily('Files and archives', ['7z'], 'archives'), false)
  assert.equal(conversionMatchesFamily('Documents', ['docx'], 'slides'), false)
})
