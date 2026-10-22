const encoder = new TextEncoder()

function text(value: string) {
  return encoder.encode(value)
}

async function jpegPage(file: File, quality: number) {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create an image canvas')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, bitmap.width, bitmap.height)
    context.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode image for PDF')), 'image/jpeg', quality / 100))
    return { width: bitmap.width, height: bitmap.height, bytes: new Uint8Array(await blob.arrayBuffer()) }
  } finally {
    bitmap.close()
  }
}

function join(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}

export async function imagesToPdf(files: File[], quality: number): Promise<Uint8Array> {
  if (!files.length || files.length > 100) throw new Error('Select between 1 and 100 images')
  const pages = await Promise.all(files.map((file) => jpegPage(file, quality)))
  if (pages.reduce((size, page) => size + page.bytes.length, 0) > 32 * 1024 * 1024) throw new Error('PDF images exceed the 32 MB limit')

  const objects: Uint8Array[] = []
  objects[1] = text('<< /Type /Catalog /Pages 2 0 R >>')
  const pageRefs = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ')
  objects[2] = text(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`)
  pages.forEach((page, index) => {
    const pageId = 3 + index * 3
    const contentId = pageId + 1
    const imageId = pageId + 2
    const content = text(`q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`)
    objects[pageId] = text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    objects[contentId] = join([text(`<< /Length ${content.length} >>\nstream\n`), content, text('\nendstream')])
    objects[imageId] = join([text(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`), page.bytes, text('\nendstream')])
  })

  const parts = [text('%PDF-1.4\n% FlickVert local image PDF\n')]
  const offsets = [0]
  let offset = parts[0].length
  for (let id = 1; id < objects.length; id++) {
    const start = text(`${id} 0 obj\n`)
    const end = text('\nendobj\n')
    offsets[id] = offset
    parts.push(start, objects[id], end)
    offset += start.length + objects[id].length + end.length
  }
  const xrefOffset = offset
  const xref = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`, ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`)].join('')
  parts.push(text(`${xref}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`))
  return join(parts)
}
