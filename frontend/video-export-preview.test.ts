import test from 'node:test'
import assert from 'node:assert/strict'
import { videoExportPreview } from './video-export-preview.ts'

test('video export preview predicts codec, container, and each batch output path', () => {
  assert.deepEqual(videoExportPreview(['C:\\Clips\\first.take.mp4', 'D:\\Other\\second.mov'], 'hevc'), {
    codec: 'HEVC (H.265)',
    container: 'Matroska (.mkv)',
    files: [
      { inputPath: 'C:\\Clips\\first.take.mp4', outputPath: 'C:\\Clips\\first.take-compressed.mkv' },
      { inputPath: 'D:\\Other\\second.mov', outputPath: 'D:\\Other\\second-compressed.mkv' },
    ],
  })
  assert.equal(videoExportPreview(['/media/clip'], 'h264', '/exports').files[0].outputPath, '/exports/clip-compressed.mp4')
  assert.equal(videoExportPreview(['C:\\clip.mp4'], 'h264', 'D:\\Exports').files[0].outputPath, 'D:\\Exports\\clip-compressed.mp4')
  assert.equal(videoExportPreview(['/media/clip.mp4'], 'h264', undefined, 'trimmed').files[0].outputPath, '/media/clip-trimmed.mp4')
})
