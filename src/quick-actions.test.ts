import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { canRunSelectedTool } from './quick-actions.ts'

test('routes selected-file tools even when the wheel was opened by shortcut', () => {
  assert.equal(canRunSelectedTool('resize', ['resize', 'rotate'], 1), true)
  assert.equal(canRunSelectedTool('resize', ['resize', 'rotate'], 0), false)
  assert.equal(canRunSelectedTool('settings', ['resize', 'rotate'], 1), false)
})
