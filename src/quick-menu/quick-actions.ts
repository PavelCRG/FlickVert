export function canRunSelectedTool(actionId: string, actionIds: string[], fileCount: number) {
  return fileCount > 0 && actionIds.includes(actionId)
}

export function canRunWheelTool(actionId: string, fileCount: number, totalBytes: number) {
  if (!Number.isInteger(fileCount) || fileCount < 1 || !Number.isFinite(totalBytes) || totalBytes < 0) return false
  if (actionId === 'image-editor') return fileCount === 1
  if (actionId === 'images-to-pdf') return fileCount <= 100 && totalBytes <= 32 * 1024 * 1024
  return true
}

export function canRunFileAction(actionId: string, files: { extension: string }[]) {
  if (!files.length) return false
  if (actionId === 'create-zip' || actionId === 'copy-to-folder' || actionId === 'move-to-folder') return true
  if (actionId === 'extract-zip') return files.length === 1 && files[0].extension === 'zip'
  return ['reveal', 'copy-path', 'open-terminal'].includes(actionId) && files.length === 1
}

export function canUseNativeImagePath(inputExtension: string, outputExtension: string, ffmpegAvailable: boolean) {
  if (!ffmpegAvailable || inputExtension === 'svg') return false
  return outputExtension === 'png' || (outputExtension === 'jpg' && ['jpg', 'jpeg'].includes(inputExtension))
}

export async function commonFormats(files: { path: string; extension: string; isDirectory: boolean }[], getFormats: (path: string) => Promise<string[]>) {
  if (!files.length || files.some((file) => file.isDirectory)) return []
  const requests = new Map<string, Promise<string[]>>()
  const lists = await Promise.all(files.map((file) => {
    if (!requests.has(file.extension)) requests.set(file.extension, getFormats(file.path))
    return requests.get(file.extension)!
  }))
  return lists[0].filter((extension) => lists.every((list) => list.includes(extension)))
}
