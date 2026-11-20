import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldNotifyUpdate, updateActionForStatus } from './update-notification.ts'

test('update notifications appear once per available version', () => {
  assert.equal(shouldNotifyUpdate('0.2.0', null), true)
  assert.equal(shouldNotifyUpdate('0.2.0', '0.2.0'), false)
  assert.equal(shouldNotifyUpdate('', null), false)
})

test('update actions are available only for states that can run them', () => {
  assert.equal(updateActionForStatus('available'), 'install')
  assert.equal(updateActionForStatus('current'), 'check')
  assert.equal(updateActionForStatus('error'), 'check')
  assert.equal(updateActionForStatus('checking'), null)
  assert.equal(updateActionForStatus('downloading'), null)
  assert.equal(updateActionForStatus('unsupported'), null)
})
