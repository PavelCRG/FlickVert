import test from 'node:test'
import assert from 'node:assert/strict'
import { purposeProfiles } from './profiles.ts'

test('purpose profiles keep bounded dimensions, quality, and supported formats', () => {
  assert.deepEqual(purposeProfiles.map(({ id }) => id), ['email', 'web', 'print'])
  assert.equal(new Set(purposeProfiles.map(({ id }) => id)).size, purposeProfiles.length)
  for (const profile of purposeProfiles) {
    assert.ok(profile.width > 0 && profile.width <= 32768)
    assert.ok(profile.height > 0 && profile.height <= 32768)
    assert.ok(profile.quality >= 40 && profile.quality <= 100)
    assert.ok(['image/jpeg', 'image/webp', 'image/png'].includes(profile.format))
  }
})
