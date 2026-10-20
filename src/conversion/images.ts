export type ImageFormat = 'image/png' | 'image/jpeg' | 'image/webp'
export type ImageOptions = { format?: string; quality?: number; width?: number; height?: number }
export type NormalizedImageOptions = { format: ImageFormat; quality: number; width?: number; height?: number }

export function normalizeImageOptions(options: ImageOptions): NormalizedImageOptions {
  const format: ImageFormat = options.format === 'image/png' || options.format === 'image/jpeg' ? options.format : 'image/webp'
  const positiveDimension = (value: number | undefined) => Number.isInteger(value) && value! > 0 && value! <= 32768 ? value : undefined
  return {
    format,
    quality: Math.max(40, Math.min(100, Math.round(Number.isFinite(options.quality) ? options.quality! : 88))),
    ...(positiveDimension(options.width) ? { width: positiveDimension(options.width) } : {}),
    ...(positiveDimension(options.height) ? { height: positiveDimension(options.height) } : {}),
  }
}

export function fitWithin(width: number, height: number, maxWidth?: number, maxHeight?: number) {
  const scale = Math.min(1, maxWidth ? maxWidth / width : 1, maxHeight ? maxHeight / height : 1)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function convertImage(file: File, options: ImageOptions): Promise<Blob> {
  const normalized = normalizeImageOptions(options)
  const bitmap = await createImageBitmap(file)
  try {
    const size = fitWithin(bitmap.width, bitmap.height, normalized.width, normalized.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create an image canvas')
    if (normalized.format === 'image/jpeg') {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, size.width, size.height)
    }
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Image conversion failed')), normalized.format, normalized.quality / 100))
    if (blob.type !== normalized.format) throw new Error(`This device cannot export ${normalized.format}`)
    return blob
  } finally {
    bitmap.close()
  }
}
