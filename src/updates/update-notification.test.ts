import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldNotifyUpdate } from './update-notification.ts'

test('update notifications appear once per available version', () => {
  assert.equal(shouldNotifyUpdate('0.2.0', null), true)
  assert.equal(shouldNotifyUpdate('0.2.0', '0.2.0'), false)
  assert.equal(shouldNotifyUpdate('', null), false)
})
