export type ToolFamily = 'all' | 'images' | 'video' | 'audio' | 'pdf' | 'documents' | 'slides' | 'spreadsheets' | 'epub' | 'subtitles' | 'archives'

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic', 'heif', 'avif', 'tif', 'tiff'])
const videoExtensions = new Set(['3gp', 'avi', 'flv', 'm2ts', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'mts', 'ogv', 'ts', 'vob', 'webm', 'wmv'])
const audioExtensions = new Set(['aac', 'aif', 'aiff', 'caf', 'flac', 'm4a', 'm4b', 'mka', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'wma'])
const subtitleExtensions = new Set(['ass', 'ssa', 'srt', 'vtt'])
const archiveExtensions = new Set(['zip', 'tar', 'tgz', 'gz'])
const slideExtensions = new Set(['ppt', 'pptx', 'odp'])
const spreadsheetExtensions = new Set(['xls', 'xlsx', 'ods', 'csv', 'tsv'])
const documentExtensions = new Set(['doc', 'docx', 'odt', 'rtf', 'md', 'markdown', 'txt', 'html', 'htm', 'rst', 'tex'])

export function conversionMatchesFamily(category: string, inputs: string[], family: ToolFamily) {
  if (family === 'all') return true
  if (family === 'images') return category === 'Images and PDFs' && inputs.some((extension) => imageExtensions.has(extension))
  if (family === 'video') return inputs.some((extension) => videoExtensions.has(extension))
  if (family === 'audio') return inputs.some((extension) => audioExtensions.has(extension))
  if (family === 'pdf') return category === 'PDF documents' || inputs.includes('pdf')
  if (family === 'slides') return inputs.some((extension) => slideExtensions.has(extension))
  if (family === 'spreadsheets') return inputs.some((extension) => spreadsheetExtensions.has(extension))
  if (family === 'epub') return inputs.includes('epub')
  if (family === 'subtitles') return inputs.some((extension) => subtitleExtensions.has(extension))
  if (family === 'archives') return inputs.some((extension) => archiveExtensions.has(extension))
  if (family === 'documents') return inputs.some((extension) => documentExtensions.has(extension))
  return false
}
