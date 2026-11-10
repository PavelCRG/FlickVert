import test from 'node:test'
import assert from 'node:assert/strict'
import { completedBatchKey } from './completion-notification.ts'

test('only complete conversion batches with at least one success can notify', () => {
  const queued = [{ id: 'one', status: 'queued' }, { id: 'two', status: 'done' }]
  assert.equal(completedBatchKey(queued), null)
  assert.equal(completedBatchKey([{ id: 'one', status: 'failed' }]), null)
  assert.equal(completedBatchKey([{ id: 'one', status: 'cancelled' }]), null)
  assert.equal(completedBatchKey([{ id: 'one', status: 'done' }, { id: 'two', status: 'failed' }]), 'one\0two')
  assert.equal(completedBatchKey([{ id: 'two', status: 'failed' }, { id: 'one', status: 'done' }]), 'one\0two')
})
