const maxSelectedPages = 10_000

export function parsePdfPageSelection(value: string, pageCount: number): number[] | null {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || !value.trim()) return null
  const pages: number[] = []
  const seen = new Set<number>()
  for (const item of value.split(',')) {
    const selection = item.trim()
    if (!selection) return null
    const range = selection.split('-')
    if (range.length > 2 || range.some((part) => !/^\d+$/.test(part.trim()))) return null
    const start = Number(range[0].trim())
    const end = range.length === 1 ? start : Number(range[1].trim())
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || start > end || end > pageCount || pages.length + end - start + 1 > maxSelectedPages) return null
    for (let page = start; page <= end; page += 1) {
      if (seen.has(page)) return null
      seen.add(page)
      pages.push(page)
    }
  }
  return pages
}

export function pdfSplitOutputPaths(inputPath: string, pages: number[], outputFolder?: string) {
  const split = Math.max(inputPath.lastIndexOf('/'), inputPath.lastIndexOf('\\'))
  const name = inputPath.slice(split + 1)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const parent = split < 0 ? '' : inputPath.slice(0, split + 1)
  const destination = outputFolder?.trim() || parent
  const separator = inputPath.includes('\\') ? '\\' : '/'
  const joiner = destination.endsWith('/') || destination.endsWith('\\') ? '' : separator
  return pages.map((page) => `${destination}${joiner}${stem}-page-${page}.pdf`)
}
