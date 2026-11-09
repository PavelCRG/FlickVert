export type VideoExportCodec = 'h264' | 'hevc'

export function videoExportPreview(paths: string[], codec: VideoExportCodec, outputFolder?: string, suffix = 'compressed') {
  const extension = codec === 'hevc' ? 'mkv' : 'mp4'
  const separator = paths[0]?.includes('\\') ? '\\' : '/'
  return {
    codec: codec === 'hevc' ? 'HEVC (H.265)' : 'H.264',
    container: codec === 'hevc' ? 'Matroska (.mkv)' : 'MP4 (.mp4)',
    files: paths.map((path) => {
      const split = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
      const fileName = path.slice(split + 1)
      const dot = fileName.lastIndexOf('.')
      const stem = dot > 0 ? fileName.slice(0, dot) : fileName
      const parent = split < 0 ? '' : path.slice(0, split + 1)
      const destination = outputFolder?.trim() || parent
      const joiner = destination.endsWith('/') || destination.endsWith('\\') ? '' : separator
      return { inputPath: path, outputPath: `${destination}${joiner}${stem}-${suffix}.${extension}` }
    }),
  }
}
