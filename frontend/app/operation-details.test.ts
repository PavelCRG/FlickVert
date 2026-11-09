import test from 'node:test'
import assert from 'node:assert/strict'
import { audioToolActions, fileActions, imageToolActions, pdfMergeActions, pdfPageActions, pdfSplitActions, videoToolActions } from '../quick-menu/quick-actions.ts'
import { operationDetails } from './operation-details.ts'

test('every catalog action declares inputs, outputs, and a limitation', () => {
  const actions = [...imageToolActions, ...videoToolActions, ...audioToolActions, ...pdfMergeActions, ...pdfSplitActions, ...pdfPageActions, ...fileActions]
  for (const { id } of actions) {
    assert.ok(operationDetails[id]?.input, `${id} input`)
    assert.ok(operationDetails[id]?.output, `${id} output`)
    assert.ok(operationDetails[id]?.limitation, `${id} limitation`)
  }
})

test('catalog details preserve known output formats and operation limits', () => {
  assert.match(operationDetails['images-to-pdf'].output, /pdf/i)
  assert.ok(operationDetails['merge-pdf'].input.startsWith('.pdf'))
  assert.match(operationDetails['merge-pdf'].limitation, /PDF/)
  assert.match(operationDetails['video-thumbnail'].output, /jpg/i)
})
