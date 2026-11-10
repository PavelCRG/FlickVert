import test from 'node:test'
import assert from 'node:assert/strict'
import { moveImagePage, rotateImagePage, type ImagePage } from './image-pages.ts'

const pages: ImagePage[] = ['a', 'b'].map((name) => ({ path: name, name, size: 1, mime: 'image/png', rotation: 0 }))

test('image PDF pages reorder without mutating their source and rotate in 90 degree steps', () => {
  assert.deepEqual(moveImagePage(pages, 0, 1).map((page) => page.name), ['b', 'a'])
  assert.deepEqual(pages.map((page) => page.name), ['a', 'b'])
  assert.equal(rotateImagePage(pages, 0)[0].rotation, 90)
  assert.equal(rotateImagePage([{ ...pages[0], rotation: 270 }], 0)[0].rotation, 0)
  assert.equal(moveImagePage(pages, 0, -1), pages)
})
