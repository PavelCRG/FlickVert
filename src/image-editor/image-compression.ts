export type CompressionFormat = 'image/png' | 'image/jpeg' | 'image/webp'

export function editorOutputExtension(format: CompressionFormat) {
  return format === 'image/jpeg' ? 'jpg' : format === 'image/png' ? 'png' : 'webp'
}

export function formatImageSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const unit = bytes < 1024 * 1024 ? 'KB' : 'MB'
  const divisor = unit === 'KB' ? 1024 : 1024 * 1024
  return `${(bytes / divisor).toFixed(1)} ${unit}`
}

export function encodeImage(image: ImageBitmap, format: CompressionFormat, quality: number, backgroundColor = '#ffffff'): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Could not create image canvas'))
  if (format === 'image/jpeg') {
    context.fillStyle = backgroundColor
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(image, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) reject(new Error('Image export failed'))
    else if (blob.type !== format) reject(new Error('This image format is not supported'))
    else resolve(blob)
  }, format, Math.max(0.4, Math.min(1, quality / 100))))
}
