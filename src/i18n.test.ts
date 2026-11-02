import test from 'node:test'
import assert from 'node:assert/strict'
import { t, type MessageKey } from './i18n.ts'

test('theme labels are translated in English, Russian, and Simplified Chinese', () => {
  const expected = {
    'Accent color': ['Accent color', 'Акцентный цвет', '强调色'],
    Blue: ['Blue', 'Синий', '蓝色'],
    Violet: ['Violet', 'Фиолетовый', '紫色'],
    Teal: ['Teal', 'Бирюзовый', '青绿色'],
    Green: ['Green', 'Зелёный', '绿色'],
    Rose: ['Rose', 'Розовый', '玫瑰色'],
  } as const

  for (const [key, labels] of Object.entries(expected)) {
    assert.equal(t('en', key as MessageKey), labels[0])
    assert.equal(t('ru', key as MessageKey), labels[1])
    assert.equal(t('zh', key as MessageKey), labels[2])
  }
})

test('JPEG transparency background is translated in all supported languages', () => {
  assert.equal(t('en', 'JPEG background'), 'JPEG background')
  assert.equal(t('ru', 'JPEG background'), 'Цвет фона JPEG')
  assert.equal(t('zh', 'JPEG background'), 'JPEG背景')
})

test('metadata removal explains which embedded fields are stripped', () => {
  assert.equal(t('en', 'Image metadata stripped (EXIF, GPS, IPTC, XMP, and comments).'), 'Image metadata stripped (EXIF, GPS, IPTC, XMP, and comments).')
  assert.notEqual(t('ru', 'Image metadata stripped (EXIF, GPS, IPTC, XMP, and comments).'), 'Image metadata stripped (EXIF, GPS, IPTC, XMP, and comments).')
  assert.notEqual(t('zh', 'Image metadata stripped (EXIF, GPS, IPTC, XMP, and comments).'), 'Image metadata stripped (EXIF, GPS, IPTC, XMP, and comments).')
})

test('video preset labels are translated in all supported languages', () => {
  assert.equal(t('en', 'Smaller file'), 'Smaller file')
  assert.equal(t('ru', 'Smaller file'), 'Меньший размер')
  assert.equal(t('zh', 'Smaller file'), '文件更小')
  assert.equal(t('zh', 'Applies to video compression: H.264 quality and AAC audio bitrate.'), '用于视频压缩：H.264 画质和 AAC 音频比特率。')
})

test('video codec availability and scaling help are translated in all supported languages', () => {
  assert.equal(t('en', 'Video codec'), 'Video codec')
  assert.equal(t('ru', 'Maximum video height'), 'Максимальная высота видео')
  assert.equal(t('zh', 'Choose supported codec'), '选择可用编码器')
  assert.equal(t('zh', 'Only software encoders available in the installed FFmpeg are listed. Smaller output height preserves aspect ratio and never upscales.'), '仅显示当前 FFmpeg 版本可用的软件编码器。降低输出高度会保持宽高比，且不会放大视频。')
  assert.notEqual(t('ru', 'Resolution scaling is not supported by the installed FFmpeg.'), 'Resolution scaling is not supported by the installed FFmpeg.')
  assert.equal(t('zh', 'Resolution scaling is not supported by the installed FFmpeg.'), '当前安装的 FFmpeg 不支持调整视频分辨率。')
})

test('video thumbnail controls are translated in all supported languages', () => {
  const keys = ['Frame time (seconds)', 'Enter a time within the video duration.', 'Choose a time to capture. The thumbnail will be saved next to the video or in your selected output folder.'] as const
  for (const key of keys) assert.equal(t('en', key), key)
  for (const language of ['ru', 'zh'] as const) {
    for (const key of keys) assert.notEqual(t(language, key), key)
  }
})

test('audio and subtitle stream controls have labels in every language', () => {
  for (const key of ['Video track', 'Audio track', 'Subtitle track', 'No subtitles', 'Detected streams', 'Reading video streams...'] as const) {
    assert.ok(t('en', key))
    assert.ok(t('ru', key))
    assert.ok(t('zh', key))
  }
})

test('video export preview labels are translated in every language', () => {
  for (const key of ['Video export preview', 'Review the output settings and destination before compression.', 'Container', 'Codec', 'Expected output', 'Close'] as const) {
    assert.ok(t('en', key))
    assert.ok(t('ru', key))
    assert.ok(t('zh', key))
  }
})

test('PDF merge controls are translated in every language', () => {
  for (const key of ['Merge PDFs', 'PDF files will be joined in this order. Original files stay unchanged.', 'Move up', 'Move down', 'Merge and save', 'Encrypted PDFs cannot be processed', 'PDF merge (pdfunite)'] as const) {
    assert.ok(t('en', key))
    assert.ok(t('ru', key))
    assert.ok(t('zh', key))
  }
})

test('PDF split controls are translated in every language', () => {
  for (const key of ['Split PDF', 'Reading PDF pages...', 'PDF page count', 'Pages to extract', 'Use page numbers and inclusive ranges, for example 1, 3-5.', 'Enter unique page numbers or ranges within the document.', 'Saved files', 'Split pages and save', 'PDF split (Poppler)', 'Encrypted PDFs cannot be processed'] as const) {
    assert.ok(t('en', key))
    assert.ok(t('ru', key))
    assert.ok(t('zh', key))
  }
})

test('PDF page editor controls are translated in every language', () => {
  for (const key of ['Arrange PDF pages', 'PDF page editor (qpdf)', 'Arrange pages and rotate selected pages. The original PDF stays unchanged.', 'Rotate left', 'Rotate right', 'Page rotation', 'Save edited PDF', 'Page'] as const) {
    assert.ok(t('en', key))
    assert.ok(t('ru', key))
    assert.ok(t('zh', key))
  }
})

test('mute action audio-track explanation is translated', () => {
  for (const key of ['Mute video needs an audio track in every selected file.', 'Could not verify an audio track in every selected file.'] as const) {
    assert.equal(t('en', key), key)
    assert.notEqual(t('ru', key), key)
    assert.notEqual(t('zh', key), key)
  }
})

test('audio normalization targets and guidance are translated', () => {
  for (const key of ['Target loudness', 'Maximum true peak', 'These targets apply to audio normalization. Lower true-peak values leave more headroom.'] as const) {
    assert.equal(t('en', key), key)
    assert.notEqual(t('ru', key), key)
    assert.notEqual(t('zh', key), key)
  }
})

test('audio extraction guidance and unavailable states are translated', () => {
  for (const key of ['Audio extraction format', 'No audio track found in the selected video.', 'Selected audio output format is unavailable in FFmpeg.', 'No supported audio output format is available in FFmpeg.', 'Audio extraction only lists formats supported by the installed FFmpeg.'] as const) {
    assert.equal(t('en', key), key)
    assert.notEqual(t('ru', key), key)
    assert.notEqual(t('zh', key), key)
  }
})
