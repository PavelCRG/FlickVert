export type Selection = { x: number; y: number; width: number; height: number }
export type PixelRect = { x: number; y: number; width: number; height: number }

export function normalizeSelection(start: [number, number], end: [number, number]): Selection {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  const x = clamp(Math.min(start[0], end[0]))
  const y = clamp(Math.min(start[1], end[1]))
  return { x, y, width: clamp(Math.max(start[0], end[0])) - x, height: clamp(Math.max(start[1], end[1])) - y }
}

export function selectionToPixels(selection: Selection, width: number, height: number): PixelRect | null {
  const x = Math.floor(selection.x * width)
  const y = Math.floor(selection.y * height)
  const right = Math.ceil((selection.x + selection.width) * width - 1e-9)
  const bottom = Math.ceil((selection.y + selection.height) * height - 1e-9)
  if (right <= x || bottom <= y) return null
  return { x, y, width: Math.min(width, right) - x, height: Math.min(height, bottom) - y }
}
