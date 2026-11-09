export function movePdfFile(paths: string[], index: number, offset: -1 | 1) {
  const target = index + offset
  if (index < 0 || index >= paths.length || target < 0 || target >= paths.length) return paths
  const next = [...paths]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function pdfMergeOutputPath(paths: string[], outputFolder?: string) {
  if (!paths.length) return ''
  const input = paths[0]
  const split = Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\'))
  const fileName = input.slice(split + 1)
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const parent = split < 0 ? '' : input.slice(0, split + 1)
  const destination = outputFolder?.trim() || parent
  const separator = input.includes('\\') ? '\\' : '/'
  return `${destination}${destination.endsWith('/') || destination.endsWith('\\') ? '' : separator}${stem}-merged.pdf`
}
