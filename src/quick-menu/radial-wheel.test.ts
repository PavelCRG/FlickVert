import assert from 'node:assert/strict'
import test from 'node:test'
import { wheelLabelPosition, wheelSectorAt, wheelSlicePath } from './radial-wheel.ts'

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

test('pointer selects clockwise sectors at native and scaled window sizes', () => {
  assert.equal(wheelSectorAt({ x: 160, y: 20 }, { width: 320, height: 320 }, 4), 0)
  assert.equal(wheelSectorAt({ x: 300, y: 160 }, { width: 320, height: 320 }, 4), 1)
  assert.equal(wheelSectorAt({ x: 600, y: 320 }, { width: 640, height: 640 }, 4), 1)
})

test('compact wheel hit area matches its 288px window', () => {
  const size = { width: 288, height: 288 }
  assert.equal(wheelSectorAt({ x: 144, y: 12 }, size, 4), 0)
  assert.equal(wheelSectorAt({ x: 144, y: 7 }, size, 4), -1)
  assert.equal(wheelSectorAt({ x: 144, y: 83 }, size, 4), -1)
})

test('pointer in the hub, outside the ring, or with no sectors selects nothing', () => {
  const size = { width: 320, height: 320 }
  assert.equal(wheelSectorAt({ x: 160, y: 160 }, size, 4), -1)
  assert.equal(wheelSectorAt({ x: 0, y: 160 }, size, 4), -1)
  assert.equal(wheelSectorAt({ x: 160, y: 20 }, size, 0), -1)
  assert.equal(wheelSectorAt({ x: 160, y: 20 }, { width: Number.NaN, height: 320 }, 4), -1)
})
