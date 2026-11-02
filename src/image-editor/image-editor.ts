export type Selection = { x: number; y: number; width: number; height: number }
export type PixelRect = { x: number; y: number; width: number; height: number }

export function normalizeSelection(start: [number, number], end: [number, number]): Selection {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const x = clamp(Math.min(start[0], end[0]))
  const y = clamp(Math.min(start[1], end[1]))
  return { x, y, width: clamp(Math.max(start[0], end[0])) - x, height: clamp(Math.max(start[1], end[1])) - y }
}

export function normalizeSelectionWithAspect(start: [number, number], end: [number, number], imageAspect: number, selectionAspect: number): Selection {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const x = clamp(start[0])
  const y = clamp(start[1])
  const directionX = end[0] < start[0] ? -1 : 1
  const directionY = end[1] < start[1] ? -1 : 1
  const ratio = selectionAspect / Math.max(imageAspect, Number.EPSILON)
  const maxWidth = directionX < 0 ? x : 1 - x
  const maxHeight = directionY < 0 ? y : 1 - y
  let width = Math.abs(end[0] - start[0])
  let height = Math.abs(end[1] - start[1])
  if (width >= height * ratio) height = width / ratio
  else width = height * ratio
  const scale = Math.min(1, maxWidth / Math.max(width, Number.EPSILON), maxHeight / Math.max(height, Number.EPSILON))
  width *= scale
  height *= scale
  const endX = x + directionX * width
  const endY = y + directionY * height
  return { x: Math.min(x, endX), y: Math.min(y, endY), width, height }
}

export function selectionToPixels(selection: Selection, width: number, height: number): PixelRect | null {
  const x = Math.floor(selection.x * width)
  const y = Math.floor(selection.y * height)
  const right = Math.ceil((selection.x + selection.width) * width - 1e-9)
  const bottom = Math.ceil((selection.y + selection.height) * height - 1e-9)
  if (right <= x || bottom <= y) return null
  return { x, y, width: Math.min(width, right) - x, height: Math.min(height, bottom) - y }
}

export function pixelAspectRatio(width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return ''
  let a = width
  let b = height
  while (b) [a, b] = [b, a % b]
  return `${width / a}:${height / a}`
}
