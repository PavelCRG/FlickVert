import type { MessageKey } from '../i18n'
import type { AppIconName } from '../icons/AppIcon'

export type QuickAction = { id: string; label: MessageKey; glyph: AppIconName }
type FileInfo = { extension: string; mime: string; hasAudio?: boolean | null }

export const launcherActions = [
  { id: 'choose-files', label: 'Choose files', glyph: 'folder' },
  { id: 'tools', label: 'Tools', glyph: 'image' },
  { id: 'settings', label: 'Settings', glyph: 'settings' },
] as const satisfies readonly QuickAction[]

export const imageToolActions = [
  { id: 'image-editor', label: 'Edit image', glyph: 'image-edit' },
  { id: 'images-to-pdf', label: 'Images to PDF', glyph: 'pdf' },
  { id: 'resize', label: 'Resize', glyph: 'resize' },
  { id: 'rotate', label: 'Rotate', glyph: 'rotate' },
  { id: 'flip', label: 'Flip', glyph: 'flip' },
  { id: 'grayscale', label: 'Grayscale', glyph: 'tone' },
  { id: 'square', label: 'Square crop', glyph: 'crop' },
  { id: 'compress', label: 'Compress', glyph: 'compress' },
  { id: 'metadata', label: 'Remove metadata', glyph: 'tag' },
] as const satisfies readonly QuickAction[]

export const videoToolActions = [
  { id: 'compress-video', label: 'Compress', glyph: 'compress' },
  { id: 'trim-video', label: 'Trim video', glyph: 'crop' },
  { id: 'mute-video', label: 'Mute video', glyph: 'mute' },
  { id: 'extract-audio', label: 'Extract audio', glyph: 'music' },
  { id: 'video-thumbnail', label: 'Create thumbnail', glyph: 'film' },
] as const satisfies readonly QuickAction[]

export const audioToolActions = [
  { id: 'compress-audio', label: 'Compress', glyph: 'compress' },
  { id: 'normalize-audio', label: 'Normalize audio', glyph: 'wave' },
] as const satisfies readonly QuickAction[]

export const archiveToolActions = [{ id: 'extract-archive', label: 'Extract archive', glyph: 'archive' }] as const satisfies readonly QuickAction[]
export const pdfMergeActions = [{ id: 'merge-pdf', label: 'Merge PDFs', glyph: 'pdf-merge' }] as const satisfies readonly QuickAction[]
export const pdfSplitActions = [{ id: 'split-pdf', label: 'Split PDF', glyph: 'pdf-split' }] as const satisfies readonly QuickAction[]
export const pdfPageActions = [{ id: 'edit-pdf-pages', label: 'Arrange PDF pages', glyph: 'pdf-pages' }] as const satisfies readonly QuickAction[]
export const allToolActions: QuickAction[] = [...imageToolActions, ...videoToolActions, ...audioToolActions]

export const fileActions = [
  { id: 'create-zip', label: 'Create ZIP', glyph: 'archive' },
  { id: 'create-tar', label: 'Create TAR', glyph: 'archive' },
  { id: 'create-targz', label: 'Create TAR.GZ', glyph: 'archive' },
  { id: 'create-gzip', label: 'Compress with GZIP', glyph: 'archive' },
  { id: 'extract-archive', label: 'Extract archive', glyph: 'archive' },
  { id: 'copy-to-folder', label: 'Copy to FlickVert', glyph: 'copy' },
  { id: 'move-to-folder', label: 'Move to FlickVert', glyph: 'move' },
  { id: 'rename-files', label: 'Rename files', glyph: 'document' },
  { id: 'reveal', label: 'Show in folder', glyph: 'folder' },
  { id: 'copy-path', label: 'Copy path', glyph: 'copy' },
  { id: 'copy-powershell-path', label: 'Copy PowerShell cd command', glyph: 'terminal' },
  { id: 'open-terminal', label: 'Open Terminal', glyph: 'terminal' },
] as const satisfies readonly QuickAction[]

export function fileActionsForPlatform(isWindows: boolean): QuickAction[] {
  return isWindows ? [...fileActions] : fileActions.filter((action) => action.id !== 'copy-powershell-path')
}

export const operationShortcutActions: QuickAction[] = [...allToolActions, ...archiveToolActions, ...pdfMergeActions, ...pdfSplitActions, ...pdfPageActions, ...fileActions].filter((action, index, actions) => actions.findIndex((candidate) => candidate.id === action.id) === index)

const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg']
const extendedImageExtensions = [...imageExtensions, 'heic', 'heif', 'avif', 'tif', 'tiff']

export function toolActionsFor(files: FileInfo[], ffmpegAvailable: boolean, imagemagickAvailable: boolean, videoCodecs: string[] = [], pdfMergeAvailable = false, pdfSplitAvailable = false, pdfEditAvailable = false): QuickAction[] {
  if (files.length === 1 && ['zip', 'tar', 'tgz', 'gz'].includes(files[0].extension)) return [...archiveToolActions]
  if (files.length === 1 && files[0].extension === 'pdf') return [...(pdfEditAvailable ? pdfPageActions : []), ...(pdfSplitAvailable ? pdfSplitActions : [])]
  if (pdfMergeAvailable && files.length > 1 && files.every((file) => file.extension === 'pdf')) return [...pdfMergeActions]
  if (files.length && files.every((file) => imageExtensions.includes(file.extension))) return files.some((file) => file.extension === 'svg') ? imageToolActions.filter((action) => action.id !== 'image-editor') : [...imageToolActions]
  if (imagemagickAvailable && files.length && files.every((file) => extendedImageExtensions.includes(file.extension))) return imageToolActions.filter((action) => !['image-editor', 'images-to-pdf', 'square'].includes(action.id))
  if (ffmpegAvailable && files.length && files.every((file) => file.mime.startsWith('video/'))) return videoToolActions.filter((action) => ['compress-video', 'trim-video'].includes(action.id) ? videoCodecs.length > 0 : action.id === 'mute-video' ? videoCodecs.includes('h264') : true)
  if (ffmpegAvailable && files.length && files.every((file) => file.mime.startsWith('audio/'))) return [...audioToolActions]
  return []
}

export function canRunSelectedTool(actionId: string, actionIds: string[], fileCount: number) {
  return fileCount > 0 && actionIds.includes(actionId)
}

export function orderWheelActions<T>(available: T[], configuredIds?: string[], getId: (action: T) => string = (action) => (action as { id: string }).id): T[] {
  if (configuredIds === undefined) return available
  const byId = new Map(available.map((action) => [getId(action), action]))
  return [...new Set(configuredIds)].flatMap((id) => byId.has(id) ? [byId.get(id)!] : [])
}

export function moveWheelAction(ids: string[], actionId: string, targetId?: string, after = false): string[] {
  if (!actionId || actionId === targetId) return ids
  const next = ids.filter((id) => id !== actionId)
  const targetIndex = targetId ? next.indexOf(targetId) : -1
  next.splice(targetIndex < 0 ? next.length : targetIndex + Number(after), 0, actionId)
  return next
}

export function selectedToolUnavailableReason(actionId: string, files: { hasAudio?: boolean | null }[], audioFormat?: string, audioFormats: string[] = []): MessageKey | null {
  if (actionId !== 'mute-video' && actionId !== 'extract-audio') return null
  if (files.some((file) => file.hasAudio === false)) return actionId === 'mute-video' ? 'Mute video needs an audio track in every selected file.' : 'No audio track found in the selected video.'
  if (!files.every((file) => file.hasAudio === true)) return 'Could not verify an audio track in every selected file.'
  if (actionId === 'extract-audio' && !audioFormats.length) return 'No supported audio output format is available in FFmpeg.'
  if (actionId === 'extract-audio' && (!audioFormat || !audioFormats.includes(audioFormat))) return 'Selected audio output format is unavailable in FFmpeg.'
  return null
}

export function canRunWheelTool(actionId: string, fileCount: number, totalBytes: number) {
  if (!Number.isInteger(fileCount) || fileCount < 1 || !Number.isFinite(totalBytes) || totalBytes < 0) return false
  if (actionId === 'image-editor') return fileCount === 1
  if (actionId === 'trim-video') return fileCount === 1
  if (actionId === 'video-thumbnail') return fileCount === 1
  if (actionId === 'merge-pdf') return fileCount >= 2 && fileCount <= 1_000
  if (actionId === 'split-pdf') return fileCount === 1
  if (actionId === 'edit-pdf-pages') return fileCount === 1
  if (actionId === 'images-to-pdf') return fileCount <= 100 && totalBytes <= 32 * 1024 * 1024
  return true
}

export function canRunFileAction(actionId: string, files: { extension: string; name?: string; isDirectory?: boolean }[]) {
  if (!files.length) return false
  if (['create-zip', 'create-tar', 'create-targz', 'copy-to-folder', 'move-to-folder'].includes(actionId)) return true
  if (actionId === 'rename-files') return files.every((file) => !file.isDirectory)
  if (actionId === 'create-gzip') return files.length === 1
  if (actionId === 'extract-archive') return files.length === 1 && (['zip', 'tar', 'tgz', 'gz'].includes(files[0].extension))
  return ['reveal', 'copy-path', 'copy-powershell-path', 'open-terminal'].includes(actionId) && files.length === 1
}

export function canUseNativeImagePath(inputExtension: string, outputExtension: string, ffmpegAvailable: boolean) {
  if (!ffmpegAvailable || inputExtension === 'svg') return false
  return outputExtension === 'png' || (outputExtension === 'jpg' && ['jpg', 'jpeg'].includes(inputExtension))
}

export function conversionConcurrency(outputExtension: string, files: { extension: string; size: number }[], ffmpegAvailable: boolean) {
  const safeSmallImages = ['png', 'jpg', 'webp'].includes(outputExtension)
    && files.length > 0
    && files.every((file) => imageExtensions.includes(file.extension)
      && file.size <= 16 * 1024 * 1024
      && !canUseNativeImagePath(file.extension, outputExtension, ffmpegAvailable))
  return safeSmallImages ? 2 : 1
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
