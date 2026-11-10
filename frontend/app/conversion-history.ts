export type ConversionHistoryEntry = { id: string; name: string; format: string; inputBytes: number; outputBytes: number; outputPath?: string; completedAt: number }
type QueueUpdate = { id: string; name: string; format?: string; status: string; inputBytes?: number; outputBytes?: number; outputPath?: string; completedAt?: number }

function validSize(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

export function normalizeConversionHistory(value: unknown): ConversionHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): ConversionHistoryEntry[] => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name || typeof item.format !== 'string' || !/^[a-z0-9]{1,12}$/.test(item.format) || !validSize(item.inputBytes) || !validSize(item.outputBytes) || !Number.isFinite(item.completedAt)) return []
    return [{ id: item.id.slice(0, 128), name: item.name.slice(0, 512), format: item.format, inputBytes: item.inputBytes, outputBytes: item.outputBytes, ...(typeof item.outputPath === 'string' && item.outputPath.length <= 4096 ? { outputPath: item.outputPath } : {}), completedAt: Number(item.completedAt) }]
  }).sort((a, b) => b.completedAt - a.completedAt).slice(0, 100)
}

export function mergeConversionHistory(history: ConversionHistoryEntry[], updates: QueueUpdate[], now = Date.now()): ConversionHistoryEntry[] {
  const entries = new Map(normalizeConversionHistory(history).map((entry) => [entry.id, entry]))
  for (const update of updates) {
    if (update.status !== 'done' || !update.format || !validSize(update.inputBytes) || !validSize(update.outputBytes)) continue
    entries.set(update.id, { id: update.id, name: update.name, format: update.format, inputBytes: update.inputBytes, outputBytes: update.outputBytes, ...(update.outputPath ? { outputPath: update.outputPath } : {}), completedAt: Number.isFinite(update.completedAt) ? update.completedAt! : now })
  }
  return normalizeConversionHistory([...entries.values()])
}

export function totalSavedBytes(history: ConversionHistoryEntry[]) {
  return history.reduce((total, entry) => total + Math.max(0, entry.inputBytes - entry.outputBytes), 0)
}

export function formatBytes(bytes: number, language: string) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** index)
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value)} ${units[index]}`
}

export function loadConversionHistory(storage: Pick<Storage, 'getItem'> = localStorage): ConversionHistoryEntry[] {
  try { return normalizeConversionHistory(JSON.parse(storage.getItem('flickvert-conversion-history') ?? '[]')) }
  catch { return [] }
}
