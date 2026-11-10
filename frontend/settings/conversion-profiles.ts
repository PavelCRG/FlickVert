import type { AppSettings, AudioExtractionFormat, PdfPageOrientation, PdfPageSize, VideoCodec, VideoHeight, VideoPreset } from '../settings'

export type ConversionProfile = {
  name: string
  quality: number
  format: AppSettings['format']
  width?: number
  height?: number
  pdfDpi: number
  pdfPageSize: PdfPageSize
  pdfPageOrientation: PdfPageOrientation
  videoPreset: VideoPreset
  videoCodec: VideoCodec
  videoHeight?: VideoHeight
  audioTargetLufs: number
  audioTruePeakDb: number
  audioExtractionFormat: AudioExtractionFormat
}

const validDimension = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0 && Number(value) <= 32768

export function normalizeConversionProfiles(value: unknown): ConversionProfile[] {
  if (!Array.isArray(value)) return []
  const names = new Set<string>()
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 32) : ''
    const key = name.toLocaleLowerCase()
    if (!name || names.has(key)) return []
    if (!Number.isInteger(raw.quality) || Number(raw.quality) < 40 || Number(raw.quality) > 100) return []
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(String(raw.format))) return []
    if (!Number.isInteger(raw.pdfDpi) || Number(raw.pdfDpi) < 72 || Number(raw.pdfDpi) > 600) return []
    if (!['source', 'a4', 'letter'].includes(String(raw.pdfPageSize)) || !['auto', 'portrait', 'landscape'].includes(String(raw.pdfPageOrientation))) return []
    if (!['small', 'balanced', 'high'].includes(String(raw.videoPreset)) || !['h264', 'hevc'].includes(String(raw.videoCodec))) return []
    if (!Number.isInteger(raw.audioTargetLufs) || Number(raw.audioTargetLufs) < -24 || Number(raw.audioTargetLufs) > -14) return []
    if (!Number.isInteger(raw.audioTruePeakDb) || Number(raw.audioTruePeakDb) < -9 || Number(raw.audioTruePeakDb) > -1) return []
    if (!['mp3', 'm4a', 'opus', 'flac', 'wav'].includes(String(raw.audioExtractionFormat))) return []
    names.add(key)
    const width = validDimension(raw.width) ? raw.width : undefined
    const height = validDimension(raw.height) ? raw.height : undefined
    return [{
      name, quality: Number(raw.quality), format: raw.format as AppSettings['format'],
      ...(width ? { width } : {}), ...(height ? { height } : {}),
      pdfDpi: Number(raw.pdfDpi), pdfPageSize: raw.pdfPageSize as PdfPageSize, pdfPageOrientation: raw.pdfPageOrientation as PdfPageOrientation,
      videoPreset: raw.videoPreset as VideoPreset, videoCodec: raw.videoCodec as VideoCodec,
      ...(raw.videoHeight === 480 || raw.videoHeight === 720 || raw.videoHeight === 1080 ? { videoHeight: raw.videoHeight as VideoHeight } : {}),
      audioTargetLufs: Number(raw.audioTargetLufs), audioTruePeakDb: Number(raw.audioTruePeakDb), audioExtractionFormat: raw.audioExtractionFormat as AudioExtractionFormat,
    }]
  }).slice(0, 20)
}

export function saveConversionProfile(profiles: ConversionProfile[], settings: AppSettings, name: string): ConversionProfile[] {
  const normalizedName = name.trim().slice(0, 32)
  if (!normalizedName) throw new Error('Profile name is required')
  const current: ConversionProfile = {
    name: normalizedName, quality: settings.quality, format: settings.format, width: settings.width, height: settings.height,
    pdfDpi: settings.pdfDpi, pdfPageSize: settings.pdfPageSize, pdfPageOrientation: settings.pdfPageOrientation,
    videoPreset: settings.videoPreset, videoCodec: settings.videoCodec, videoHeight: settings.videoHeight,
    audioTargetLufs: settings.audioTargetLufs, audioTruePeakDb: settings.audioTruePeakDb, audioExtractionFormat: settings.audioExtractionFormat,
  }
  const next = profiles.filter((profile) => profile.name.toLocaleLowerCase() !== normalizedName.toLocaleLowerCase())
  return [...next, current].slice(-20)
}

export function applyConversionProfile(profile: ConversionProfile): Partial<AppSettings> {
  const { name: _name, ...settings } = profile
  return settings
}

export function removeConversionProfile(profiles: ConversionProfile[], name: string): ConversionProfile[] {
  return profiles.filter((profile) => profile.name !== name)
}
