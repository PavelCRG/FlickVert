type PreviewFile = { name: string; path: string }

export function conversionPreviewDetail(hasPreview: boolean, detail: string) {
  return hasPreview ? '' : detail
}

function parentPath(path: string) {
  const parent = path.replace(/[\\/][^\\/]*$/, '')
  if (parent) return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent
  return path.startsWith('/') ? '/' : ''
}

export function conversionPreview(files: PreviewFile[], extension: string, outputFolder?: string) {
  const name = files[0]?.name ?? ''
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const outputName = files.length === 1 ? `${stem}.${extension}` : `${files.length} files · .${extension}`
  const folders = [...new Set(files.map((file) => parentPath(file.path)))]
  return { outputName, destination: outputFolder || (folders.length === 1 ? folders[0] : 'Source folders') }
}
