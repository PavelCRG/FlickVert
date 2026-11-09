export function validateVideoTrimRange(start: string, end: string, durationUs: number): { startUs: number; endUs: number } | null {
  if (!start.trim() || !end.trim() || !Number.isSafeInteger(durationUs) || durationUs <= 0) return null
  const startSeconds = Number(start)
  const endSeconds = Number(end)
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return null
  const startUs = Math.round(startSeconds * 1_000_000)
  const endUs = Math.round(endSeconds * 1_000_000)
  return startUs >= 0 && startUs < endUs && endUs <= durationUs ? { startUs, endUs } : null
}

export function validateVideoFrameTime(time: string, durationUs: number): number | null {
  if (!time.trim() || !Number.isSafeInteger(durationUs) || durationUs <= 0) return null
  const seconds = Number(time)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  const timeUs = Math.round(seconds * 1_000_000)
  return Number.isSafeInteger(timeUs) && timeUs < durationUs ? timeUs : null
}
