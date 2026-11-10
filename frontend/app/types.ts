import type { OperationErrorKind } from '../quick-menu/operation-errors'

export type Engines = { ffmpeg: boolean; pandoc: boolean; imagemagick: boolean; libreoffice: boolean; poppler: boolean }
export type ConversionCatalogItem = { category: string; inputExtensions: string[]; outputExtensions: string[]; engine: string; available: boolean; limitation?: string }
export type OperationQueueItem = { id: string; name: string; status: 'queued' | 'processing' | 'done' | 'failed' | 'cancelled'; outputPath?: string; format?: string; inputBytes?: number; outputBytes?: number; completedAt?: number; retryReady?: boolean; jobId?: string; progress?: number; error?: OperationErrorKind }
