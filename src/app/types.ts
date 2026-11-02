import type { OperationErrorKind } from '../quick-menu/operation-errors'

export type Engines = { ffmpeg: boolean; pandoc: boolean; imagemagick: boolean; libreoffice: boolean; poppler: boolean; pdfunite: boolean; pdfsplit: boolean; qpdf: boolean }
export type ConversionCatalogItem = { category: string; inputExtensions: string[]; outputExtensions: string[]; engine: string; available: boolean }
export type OperationQueueItem = { id: string; name: string; status: 'queued' | 'processing' | 'done' | 'failed' | 'cancelled'; outputPath?: string; retryReady?: boolean; jobId?: string; progress?: number; error?: OperationErrorKind }
