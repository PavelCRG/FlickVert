export type EngineGuide = { name: string; url: string }

const pages: Record<string, string> = {
  FFmpeg: 'https://ffmpeg.org/download.html',
  Pandoc: 'https://pandoc.org/installing.html',
  ImageMagick: 'https://imagemagick.org/download/',
  LibreOffice: 'https://www.libreoffice.org/download/',
  Poppler: 'https://poppler.freedesktop.org/',
  qpdf: 'https://github.com/qpdf/qpdf/releases',
}

export function engineGuides(engine: string): EngineGuide[] {
  return engine.split(' + ').flatMap((name) => pages[name] ? [{ name, url: pages[name] }] : [])
}
