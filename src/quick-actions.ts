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
