import assert from 'node:assert/strict'
import test from 'node:test'
import { wheelLabelPosition, wheelSlicePath } from './radial-wheel.ts'

test('radial sectors are centered clockwise from the top and leave a clear hub', () => {
  const top = wheelSlicePath(0, 4)
  const right = wheelSlicePath(1, 4)
  const points = (path: string) => path.match(/^M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+) A174 174 0 0 1 ([\d.]+) ([\d.]+)/)
  const topPoints = points(top)
  const rightPoints = points(right)
  assert.ok(topPoints && rightPoints)
  assert.ok(Math.abs(Number(topPoints[3]) + Number(topPoints[5]) - 352) < 0.02)
  assert.ok(Math.abs(Number(topPoints[4]) - Number(topPoints[6])) < 0.02)
  assert.ok(Number(topPoints[4]) < 176)
  assert.ok(Number(rightPoints[3]) > 176 && Number(rightPoints[5]) > 176)
  assert.match(top, /A80 80 0 0 0 /)
})

test('wheel labels sit halfway through each segment', () => {
  assert.deepEqual(wheelLabelPosition(0, 4), { left: '50%', top: '13.92%' })
  assert.deepEqual(wheelLabelPosition(1, 4), { left: '86.08%', top: '50%' })
})
