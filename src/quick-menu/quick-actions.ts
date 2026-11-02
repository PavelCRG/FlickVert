import type { MessageKey } from '../i18n'

export type QuickAction = { id: string; label: MessageKey; glyph: string }
type FileInfo = { extension: string; mime: string }

export const imageToolActions = [
  { id: 'image-editor', label: 'Edit image', glyph: 'вњ¦' },
  { id: 'images-to-pdf', label: 'Images to PDF', glyph: 'PDF' },
  { id: 'resize', label: 'Resize', glyph: 'в†”' },
  { id: 'rotate', label: 'Rotate', glyph: 'в†»' },
  { id: 'flip', label: 'Flip', glyph: 'в‡‹' },
  { id: 'grayscale', label: 'Grayscale', glyph: 'в—ђ' },
  { id: 'square', label: 'Square crop', glyph: 'в–Ў' },
  { id: 'compress', label: 'Compress', glyph: 'в—’' },
  { id: 'metadata', label: 'Remove metadata', glyph: 'в—‡' },
] as const satisfies readonly QuickAction[]

export const videoToolActions = [
  { id: 'compress-video', label: 'Compress', glyph: 'в—’' },
  { id: 'mute-video', label: 'Mute video', glyph: 'в—–' },
  { id: 'extract-audio', label: 'Extract audio', glyph: 'в™«' },
  { id: 'video-thumbnail', label: 'Create thumbnail', glyph: 'в–Ј' },
] as const satisfies readonly QuickAction[]

export const audioToolActions = [
  { id: 'compress-audio', label: 'Compress', glyph: 'в—’' },
  { id: 'normalize-audio', label: 'Normalize audio', glyph: 'в–‚' },
] as const satisfies readonly QuickAction[]

export const archiveToolActions = [{ id: 'extract-zip', label: 'Extract ZIP', glyph: 'ZIP' }] as const satisfies readonly QuickAction[]
export const allToolActions: QuickAction[] = [...imageToolActions, ...videoToolActions, ...audioToolActions]

export const fileActions = [
  { id: 'create-zip', label: 'Create ZIP', glyph: 'в–±' },
  { id: 'extract-zip', label: 'Extract ZIP', glyph: 'в–Ј' },
  { id: 'copy-to-folder', label: 'Copy to FlickVert', glyph: 'в§‰' },
  { id: 'move-to-folder', label: 'Move to FlickVert', glyph: 'в‡Ґ' },
  { id: 'reveal', label: 'Show in folder', glyph: 'в†—' },
  { id: 'copy-path', label: 'Copy path', glyph: 'вЋ' },
  { id: 'copy-powershell-path', label: 'Copy path for PowerShell', glyph: '>_' },
  { id: 'open-terminal', label: 'Open Terminal', glyph: '>_' },
] as const satisfies readonly QuickAction[]

export function fileActionsForPlatform(isWindows: boolean): QuickAction[] {
  return isWindows ? [...fileActions] : fileActions.filter((action) => action.id !== 'copy-powershell-path')
}

const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
const extendedImageExtensions = [...imageExtensions, 'heic', 'heif', 'avif', 'tif', 'tiff']

export function toolActionsFor(files: FileInfo[], ffmpegAvailable: boolean, imagemagickAvailable: boolean): QuickAction[] {
  if (files.length === 1 && files[0].extension === 'zip') return [...archiveToolActions]
  if (files.length && files.every((file) => imageExtensions.includes(file.extension))) return files.some((file) => file.extension === 'svg') ? imageToolActions.filter((action) => action.id !== 'image-editor') : [...imageToolActions]
  if (imagemagickAvailable && files.length && files.every((file) => extendedImageExtensions.includes(file.extension))) return imageToolActions.filter((action) => !['image-editor', 'images-to-pdf', 'square'].includes(action.id))
  if (ffmpegAvailable && files.length && files.every((file) => file.mime.startsWith('video/'))) return [...videoToolActions]
  if (ffmpegAvailable && files.length && files.every((file) => file.mime.startsWith('audio/'))) return [...audioToolActions]
  return []
}

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
  return ['reveal', 'copy-path', 'copy-powershell-path', 'open-terminal'].includes(actionId) && files.length === 1
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
