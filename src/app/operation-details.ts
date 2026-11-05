import type { MessageKey } from '../i18n'

export type OperationDetail = { input: string; output: string; limitation: MessageKey }

const images = '.png, .jpg, .jpeg, .webp, .gif, .bmp, .svg'
const videos = '.3gp, .avi, .flv, .m2ts, .m4v, .mkv, .mov, .mp4, .mpeg, .mpg, .mts, .ogv, .ts, .vob, .webm, .wmv'
const audio = '.aac, .aif, .aiff, .caf, .flac, .m4a, .m4b, .mka, .mp3, .oga, .ogg, .opus, .wav, .wma'
const imageOutput = '.png, .jpg, .webp'
const selected = 'Available when the matching file type is selected.' as const
const section = 'Choose the section to keep. The original file will remain unchanged.' as const
const engine = 'Check the selected file and required engine.' as const

export const operationDetails: Record<string, OperationDetail> = {
  'image-editor': { input: images, output: imageOutput, limitation: selected },
  'images-to-pdf': { input: images, output: '.pdf', limitation: selected },
  resize: { input: images, output: imageOutput, limitation: selected },
  rotate: { input: images, output: imageOutput, limitation: selected },
  flip: { input: images, output: imageOutput, limitation: selected },
  grayscale: { input: images, output: imageOutput, limitation: selected },
  square: { input: images, output: imageOutput, limitation: selected },
  compress: { input: images, output: '.jpg', limitation: selected },
  metadata: { input: images, output: imageOutput, limitation: selected },
  'compress-video': { input: videos, output: '.mp4 (H.264) or .mkv (HEVC)', limitation: engine },
  'trim-video': { input: videos, output: '.mp4 (H.264) or .mkv (HEVC)', limitation: section },
  'mute-video': { input: videos, output: '.mp4', limitation: engine },
  'extract-audio': { input: videos, output: '.mp3, .m4a, .opus, .flac, .wav', limitation: engine },
  'video-thumbnail': { input: videos, output: '.jpg', limitation: selected },
  'compress-audio': { input: audio, output: '.m4a', limitation: engine },
  'normalize-audio': { input: audio, output: '.m4a', limitation: engine },
  'merge-pdf': { input: '.pdf (2-1000 files)', output: '.pdf', limitation: 'Encrypted PDFs cannot be processed' },
  'split-pdf': { input: '.pdf (one file)', output: '.pdf (selected pages)', limitation: 'Encrypted PDFs cannot be processed' },
  'edit-pdf-pages': { input: '.pdf (one file)', output: '.pdf', limitation: 'Encrypted PDFs cannot be processed' },
  'create-zip': { input: 'Files and folders', output: '.zip', limitation: selected },
  'extract-zip': { input: '.zip', output: 'New folder', limitation: selected },
  'copy-to-folder': { input: 'Files and folders', output: 'Copies with original extensions', limitation: selected },
  'move-to-folder': { input: 'Files and folders', output: 'Moves with original extensions', limitation: selected },
  reveal: { input: 'One file or folder', output: 'No output file', limitation: selected },
  'copy-path': { input: 'One file or folder', output: 'Path copied to clipboard', limitation: selected },
  'copy-powershell-path': { input: 'One file or folder', output: 'PowerShell path copied', limitation: selected },
  'open-terminal': { input: 'One file or folder', output: 'Terminal opened in its folder', limitation: selected },
}
