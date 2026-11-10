export function completedBatchKey(items: { id: string; status: string }[]): string | null {
  if (!items.length || !items.some((item) => item.status === 'done') || !items.every((item) => ['done', 'failed', 'cancelled'].includes(item.status))) return null
  return items.map((item) => item.id).sort().join('\0')
}
