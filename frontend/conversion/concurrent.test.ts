import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mapConcurrent } from './concurrent.ts'

test('mapConcurrent limits workers and preserves input order', async () => {
  let active = 0
  let maximum = 0
  const result = await mapConcurrent([24, 2, 16, 8], 2, async (delay) => {
    active++
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, delay))
    active--
    return delay * 2
  })

  assert.deepEqual(result, [48, 4, 32, 16])
  assert.equal(maximum, 2)
})

test('mapConcurrent waits for active work and stops scheduling after a failure', async () => {
  const started: number[] = []
  await assert.rejects(mapConcurrent([1, 2, 3, 4], 2, async (value) => {
    started.push(value)
    if (value === 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
      throw new Error('conversion failed')
    }
    await new Promise((resolve) => setTimeout(resolve, 15))
    return value
  }), /conversion failed/)
  assert.deepEqual(started, [1, 2])
})
