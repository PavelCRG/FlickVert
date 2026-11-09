import test from 'node:test'
import assert from 'node:assert/strict'
import { completeFirstRun, firstRunSection } from './first-run.ts'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

test('a fresh install opens quick start once and then opens home', () => {
  const storage = memoryStorage()
  assert.equal(firstRunSection(storage), 'guide')
  completeFirstRun(storage)
  assert.equal(firstRunSection(storage), 'home')
})

test('a completed first run opens home on later launches', () => {
  assert.equal(firstRunSection(memoryStorage({ 'flickvert:first-run-complete': 'true' })), 'home')
})
