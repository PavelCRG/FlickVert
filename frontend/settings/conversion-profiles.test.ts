import test from 'node:test'
import assert from 'node:assert/strict'
import { applyConversionProfile, normalizeConversionProfiles, removeConversionProfile, saveConversionProfile } from './conversion-profiles.ts'
import { defaultSettings } from '../settings.ts'

test('conversion profiles keep validated settings across image, PDF, video, and audio tools', () => {
  const settings = { ...defaultSettings, quality: 76, format: 'image/jpeg' as const, width: 1600, pdfPageSize: 'a4' as const, videoPreset: 'small' as const, audioTargetLufs: -18 }
  const saved = saveConversionProfile([], settings, '  Web delivery  ')
  assert.equal(saved[0].name, 'Web delivery')
  assert.deepEqual(applyConversionProfile(saved[0]), {
    quality: 76, format: 'image/jpeg', width: 1600, height: undefined, pdfDpi: 300, pdfPageSize: 'a4', pdfPageOrientation: 'auto',
    videoPreset: 'small', videoCodec: 'h264', videoHeight: undefined, audioTargetLufs: -18, audioTruePeakDb: -1, audioExtractionFormat: 'mp3',
  })
  assert.equal(normalizeConversionProfiles([...saved, { ...saved[0], name: 'web DELIVERY' }]).length, 1)
  assert.equal(normalizeConversionProfiles([{ ...saved[0], quality: 101 }]).length, 0)
  assert.deepEqual(removeConversionProfile(saved, 'Web delivery'), [])
})
