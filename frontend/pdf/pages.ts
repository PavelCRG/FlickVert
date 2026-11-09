export function movePdfPage(pages: number[], index: number, offset: -1 | 1) {
  const target = index + offset
  if (index < 0 || index >= pages.length || target < 0 || target >= pages.length) return pages
  const next = [...pages]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function rotatePdfPage(rotations: number[], index: number, direction: -1 | 1) {
  if (index < 0 || index >= rotations.length) return rotations
  const next = [...rotations]
  next[index] = (next[index] + direction * 90 + 360) % 360
  return next
}

export function validPdfPageOrder(pages: number[], pageCount: number) {
  return Number.isSafeInteger(pageCount) && pageCount > 0 && pageCount <= 3_000 && pages.length === pageCount && new Set(pages).size === pageCount && pages.every((page) => Number.isSafeInteger(page) && page >= 1 && page <= pageCount)
}

export function pdfPagesOutputPath(inputPath: string, outputFolder?: string) {
  const split = Math.max(inputPath.lastIndexOf('/'), inputPath.lastIndexOf('\\'))
  const name = inputPath.slice(split + 1)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const parent = split < 0 ? '' : inputPath.slice(0, split + 1)
  const destination = outputFolder?.trim() || parent
  const separator = inputPath.includes('\\') ? '\\' : '/'
  const joiner = destination.endsWith('/') || destination.endsWith('\\') ? '' : separator
  return `${destination}${joiner}${stem}-edited.pdf`
}
