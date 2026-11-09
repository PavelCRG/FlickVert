export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : 1)))
  let next = 0
  let completed = 0
  let failed = false
  let failure: unknown

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (!failed) {
      const index = next++
      if (index >= items.length) return
      try {
        results[index] = await operation(items[index], index)
        onProgress?.(++completed)
      } catch (error) {
        if (!failed) failure = error
        failed = true
      }
    }
  }))

  if (failed) throw failure
  return results
}
