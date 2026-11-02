export type PdfPageSize = 'source' | 'a4' | 'letter'
export type PdfPageOrientation = 'auto' | 'portrait' | 'landscape'

export function pdfPageLayout(width: number, height: number, size: PdfPageSize, orientation: PdfPageOrientation) {
  let [pageWidth, pageHeight] = size === 'a4' ? [595.28, 841.89] : size === 'letter' ? [612, 792] : [width, height]
  if ((orientation === 'landscape' && pageWidth < pageHeight) || (orientation === 'portrait' && pageWidth > pageHeight) || (orientation === 'auto' && (width > height) !== (pageWidth > pageHeight))) [pageWidth, pageHeight] = [pageHeight, pageWidth]
  const scale = Math.min(pageWidth / width, pageHeight / height)
  const imageWidth = width * scale
  const imageHeight = height * scale
  return { pageWidth, pageHeight, imageWidth, imageHeight, x: (pageWidth - imageWidth) / 2, y: (pageHeight - imageHeight) / 2 }
}
