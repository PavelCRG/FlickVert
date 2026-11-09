export type DraftHistory<T> = { past: T[]; future: T[] }

export function checkpointDraft<T>(history: DraftHistory<T>, current: T): DraftHistory<T> {
  return { past: [...history.past.slice(-49), current], future: [] }
}

export function undoDraft<T>(history: DraftHistory<T>, current: T) {
  const previous = history.past.at(-1)
  return previous === undefined ? null : {
    current: previous,
    history: { past: history.past.slice(0, -1), future: [...history.future, current] },
  }
}

export function redoDraft<T>(history: DraftHistory<T>, current: T) {
  const next = history.future.at(-1)
  return next === undefined ? null : {
    current: next,
    history: { past: [...history.past, current], future: history.future.slice(0, -1) },
  }
}
