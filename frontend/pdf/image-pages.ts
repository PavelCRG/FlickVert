export type ImagePage = { path: string; name: string; size: number; mime: string; rotation: 0 | 90 | 180 | 270 }

export function moveImagePage(pages: ImagePage[], index: number, offset: -1 | 1): ImagePage[] {
  const target = index + offset
  if (index < 0 || index >= pages.length || target < 0 || target >= pages.length) return pages
  const next = [...pages]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function rotateImagePage(pages: ImagePage[], index: number): ImagePage[] {
  if (index < 0 || index >= pages.length) return pages
  return pages.map((page, current) => current === index ? { ...page, rotation: ((page.rotation + 90) % 360) as ImagePage['rotation'] } : page)
}
