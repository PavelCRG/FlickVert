import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { canRunFileAction, canRunSelectedTool, canRunWheelTool, canUseNativeImagePath, commonFormats, conversionConcurrency, launcherActions, operationShortcutActions, selectedToolUnavailableReason, toolActionsFor } from './quick-actions.ts'
import { operationErrorKind } from './operation-errors.ts'
import { conversionPreview, conversionPreviewDetail } from './conversion-preview.ts'
import { validateVideoFrameTime, validateVideoTrimRange } from '../video-trim/ranges.ts'

test('conversion preview shows the target name and destination before starting', () => {
  assert.deepEqual(conversionPreview([{ name: 'photo.original.jpg', path: 'C:\\Photos\\photo.original.jpg' }], 'webp'), {
    outputName: 'photo.original.webp',
    destination: 'C:\\Photos',
  })
  assert.equal(conversionPreview([{ name: '.env', path: 'C:\\photo.jpg' }], 'png').outputName, '.env.png')
  assert.equal(conversionPreview([{ name: 'photo.jpg', path: 'C:\\photo.jpg' }], 'png').destination, 'C:\\')
  assert.deepEqual(conversionPreview([{ name: 'a.png', path: '/photos/a.png' }, { name: 'b.png', path: '/photos/b.png' }], 'jpg', '/exports'), {
    outputName: '2 files · .jpg',
    destination: '/exports',
  })
  assert.equal(conversionPreview([{ name: 'a.png', path: '/one/a.png' }, { name: 'b.png', path: '/two/b.png' }], 'jpg').destination, 'Source folders')
})

test('conversion preview keeps the format label clear of the filename detail', () => {
  assert.equal(conversionPreviewDetail(true, 'photo.webp'), '')
  assert.equal(conversionPreviewDetail(false, 'photo.webp'), 'photo.webp')
})

test('the empty quick popup offers file selection, tools, and settings without file actions', () => {
  assert.deepEqual(launcherActions.map(({ id }) => id), ['choose-files', 'tools', 'settings'])
})

test('operation errors map only known native codes to user-facing categories', () => {
  assert.equal(operationErrorKind('flickvert-error:input'), 'input')
  assert.equal(operationErrorKind('flickvert-error:access'), 'access')
  assert.equal(operationErrorKind('flickvert-error:engine'), 'engine')
  assert.equal(operationErrorKind('flickvert-error:conversion'), 'conversion')
  assert.equal(operationErrorKind('flickvert-error:protected'), 'protected')
  assert.equal(operationErrorKind(new Error('flickvert-error:write')), 'write')
  assert.equal(operationErrorKind('flickvert-error:unsupported'), 'unsupported')
  assert.equal(operationErrorKind('flickvert-error:cancelled'), 'cancelled')
  assert.equal(operationErrorKind('flickvert-error:pdf-no-text'), 'pdfNoText')
  assert.equal(operationErrorKind('unrecognized native error with a local path'), 'conversion')
})

test('format lookup is shared for files of the same type', async () => {
  const calls: string[] = []
  const files = [{ path: 'a.png', extension: 'png', isDirectory: false }, { path: 'b.png', extension: 'png', isDirectory: false }, { path: 'c.jpg', extension: 'jpg', isDirectory: false }]
  const result = await commonFormats(files, async (path) => { calls.push(path); return path.endsWith('png') ? ['png', 'jpg'] : ['jpg', 'webp'] })
  assert.deepEqual(calls, ['a.png', 'c.jpg'])
  assert.deepEqual(result, ['jpg'])
  assert.deepEqual(await commonFormats([{ path: 'folder', extension: '', isDirectory: true }], async () => { throw new Error('unexpected lookup') }), [])
})

test('batch conversion offers the formats shared by selected subtitle files', async () => {
  const files = [{ path: 'captions.srt', extension: 'srt', isDirectory: false }, { path: 'captions.vtt', extension: 'vtt', isDirectory: false }]
  assert.deepEqual(await commonFormats(files, async () => ['ass', 'srt', 'ssa', 'vtt']), ['ass', 'srt', 'ssa', 'vtt'])
})

test('routes selected-file tools even when the wheel was opened by shortcut', () => {
  assert.equal(canRunSelectedTool('resize', ['resize', 'rotate'], 1), true)
  assert.equal(canRunSelectedTool('resize', ['resize', 'rotate'], 0), false)
  assert.equal(canRunSelectedTool('settings', ['resize', 'rotate'], 1), false)
})

test('wheel disables image actions with invalid selection size or PDF limits', () => {
  const limit = 32 * 1024 * 1024
  assert.equal(canRunWheelTool('image-editor', 1, 1), true)
  assert.equal(canRunWheelTool('image-editor', 2, 1), false)
  assert.equal(canRunWheelTool('images-to-pdf', 100, limit), true)
  assert.equal(canRunWheelTool('images-to-pdf', 101, 1), false)
  assert.equal(canRunWheelTool('images-to-pdf', 1, limit + 1), false)
  assert.equal(canRunWheelTool('resize', 1, -1), false)
  assert.equal(canRunWheelTool('resize', 0, 0), false)
})

test('wheel only runs file actions that support the selected file set', () => {
  assert.equal(canRunFileAction('create-zip', [{ extension: 'png' }, { extension: 'zip' }]), true)
  assert.equal(canRunFileAction('create-tar', [{ extension: 'txt' }]), true)
  assert.equal(canRunFileAction('create-targz', [{ extension: 'txt' }]), true)
  assert.equal(canRunFileAction('create-gzip', [{ extension: 'txt' }]), true)
  assert.equal(canRunFileAction('create-gzip', [{ extension: 'txt' }, { extension: 'md' }]), false)
  assert.equal(canRunFileAction('extract-archive', [{ extension: 'zip' }]), true)
  assert.equal(canRunFileAction('extract-archive', [{ extension: 'tar' }]), true)
  assert.equal(canRunFileAction('extract-archive', [{ extension: 'png' }]), false)
  assert.equal(canRunFileAction('reveal', [{ extension: 'png' }, { extension: 'jpg' }]), false)
  assert.equal(canRunFileAction('move-to-folder', []), false)
})

test('native image path only handles formats that preserve alpha and supported fallbacks', () => {
  assert.equal(canUseNativeImagePath('png', 'png', true), true)
  assert.equal(canUseNativeImagePath('jpg', 'jpg', true), true)
  assert.equal(canUseNativeImagePath('png', 'jpg', true), false)
  assert.equal(canUseNativeImagePath('svg', 'png', true), false)
  assert.equal(canUseNativeImagePath('jpg', 'png', false), false)
})

test('batch conversion uses parallel workers only for small fallback images', () => {
  const small = [{ extension: 'png', size: 2 * 1024 * 1024 }, { extension: 'jpg', size: 5 * 1024 * 1024 }]
  assert.equal(conversionConcurrency('webp', small, true), 2)
  assert.equal(conversionConcurrency('png', small, true), 1)
  assert.equal(conversionConcurrency('webp', [{ extension: 'png', size: 16 * 1024 * 1024 + 1 }], false), 1)
  assert.equal(conversionConcurrency('webp', [{ extension: 'mp4', size: 1 }], true), 1)
  assert.equal(conversionConcurrency('webp', [], true), 1)
})

test('video actions only expose encoders available in the installed FFmpeg', () => {
  const video = [{ extension: 'mp4', mime: 'video/mp4' }]
  assert.equal(toolActionsFor(video, true, false, []).some((action) => action.id === 'compress-video' || action.id === 'mute-video'), false)
  const hevc = toolActionsFor(video, true, false, ['hevc'])
  assert.equal(hevc.some((action) => action.id === 'compress-video'), true)
  assert.equal(hevc.some((action) => action.id === 'mute-video'), false)
  const h264 = toolActionsFor(video, true, false, ['h264'])
  assert.equal(h264.some((action) => action.id === 'compress-video'), true)
  assert.equal(h264.some((action) => action.id === 'mute-video'), true)
})

test('PDF merge is offered only for multiple PDFs when pdfunite is available', () => {
  assert.equal(toolActionsFor([{ extension: 'pdf', mime: 'application/pdf' }, { extension: 'pdf', mime: 'application/pdf' }], false, false, [], true)[0]?.id, 'merge-pdf')
  assert.deepEqual(toolActionsFor([{ extension: 'pdf', mime: 'application/pdf' }, { extension: 'pdf', mime: 'application/pdf' }], false, false), [])
  assert.deepEqual(toolActionsFor([{ extension: 'pdf', mime: 'application/pdf' }], false, false, [], true), [])
  assert.equal(canRunWheelTool('merge-pdf', 2, 0), true)
  assert.equal(canRunWheelTool('merge-pdf', 1, 0), false)
})

test('PDF split is offered only for one PDF when Poppler split tools are available', () => {
  const pdf = [{ extension: 'pdf', mime: 'application/pdf' }]
  assert.equal(toolActionsFor(pdf, false, false, [], false, true)[0]?.id, 'split-pdf')
  assert.deepEqual(toolActionsFor(pdf, false, false), [])
  assert.deepEqual(toolActionsFor([...pdf, ...pdf], false, false, [], false, true), [])
  assert.equal(canRunWheelTool('split-pdf', 1, 100), true)
  assert.equal(canRunWheelTool('split-pdf', 2, 100), false)
})

test('PDF page editor is offered only for one PDF when qpdf is available', () => {
  const pdf = [{ extension: 'pdf', mime: 'application/pdf' }]
  assert.equal(toolActionsFor(pdf, false, false, [], false, false, true)[0]?.id, 'edit-pdf-pages')
  assert.deepEqual(toolActionsFor([...pdf, ...pdf], false, false, [], false, false, true), [])
  assert.equal(canRunWheelTool('edit-pdf-pages', 1, 10), true)
  assert.equal(canRunWheelTool('edit-pdf-pages', 2, 10), false)
})

test('mute action reports when any selected video has no audio track', () => {
  assert.equal(selectedToolUnavailableReason('mute-video', [{ hasAudio: false }]), 'Mute video needs an audio track in every selected file.')
  assert.equal(selectedToolUnavailableReason('mute-video', [{ hasAudio: true }, { hasAudio: false }]), 'Mute video needs an audio track in every selected file.')
  assert.equal(selectedToolUnavailableReason('mute-video', [{ hasAudio: undefined }]), 'Could not verify an audio track in every selected file.')
  assert.equal(selectedToolUnavailableReason('mute-video', [{ hasAudio: null }]), 'Could not verify an audio track in every selected file.')
  assert.equal(selectedToolUnavailableReason('trim-video', [{ hasAudio: false }]), null)
  assert.equal(selectedToolUnavailableReason('extract-audio', [{ hasAudio: false }]), 'No audio track found in the selected video.')
  assert.equal(selectedToolUnavailableReason('extract-audio', [{ hasAudio: true }], 'wav', ['mp3']), 'Selected audio output format is unavailable in FFmpeg.')
  assert.equal(selectedToolUnavailableReason('extract-audio', [{ hasAudio: true }], 'mp3', ['mp3']), null)
})

test('video trim range uses integer microseconds and stays inside the source duration', () => {
  assert.deepEqual(validateVideoTrimRange('1.25', '4', 4_000_000), { startUs: 1_250_000, endUs: 4_000_000 })
  for (const [start, end, duration] of [['', '2', 3_000_000], ['2', '2', 3_000_000], ['3', '2', 3_000_000], ['0', '3.001', 3_000_000], ['-1', '2', 3_000_000], ['0', 'Infinity', 3_000_000], ['0', '2', 0]] as const) {
    assert.equal(validateVideoTrimRange(start, end, duration), null)
  }
})

test('video trimming only runs for one selected file', () => {
  assert.equal(canRunWheelTool('trim-video', 1, 100), true)
  assert.equal(canRunWheelTool('trim-video', 2, 100), false)
  assert.equal(canRunWheelTool('video-thumbnail', 1, 100), true)
  assert.equal(canRunWheelTool('video-thumbnail', 2, 100), false)
})

test('video thumbnail time must point inside the source duration', () => {
  assert.equal(validateVideoFrameTime('1.25', 2_000_000), 1_250_000)
  assert.equal(validateVideoFrameTime('0', 2_000_000), 0)
  for (const value of ['', '-0.1', '2', 'Infinity']) assert.equal(validateVideoFrameTime(value, 2_000_000), null)
})

test('operation shortcut catalog contains unique wheel operations', () => {
  const ids = operationShortcutActions.map((action) => action.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('extract-archive'))
  assert.ok(ids.includes('edit-pdf-pages'))
  assert.ok(ids.includes('copy-path'))
})
