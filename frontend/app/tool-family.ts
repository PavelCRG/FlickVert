export type ToolFamily = 'all' | 'images' | 'documents' | 'media' | 'pdf' | 'files'

export function conversionMatchesFamily(category: string, inputs: string[], family: ToolFamily) {
  if (family === 'all') return true
  if (family === 'images') return category === 'Images and PDFs' && inputs.some((extension) => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic', 'heif', 'avif', 'tif', 'tiff'].includes(extension))
  if (family === 'pdf') return category === 'PDF documents' || inputs.includes('pdf')
  if (family === 'documents') return category === 'Documents'
  if (family === 'media') return category === 'Subtitles' || category === 'Audio' || category === 'Audio and video'
  return category === 'Files and archives'
}
