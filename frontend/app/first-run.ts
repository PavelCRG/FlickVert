const firstRunKey = 'flickvert:first-run-complete'

export function firstRunSection(storage: Pick<Storage, 'getItem'>): 'guide' | 'home' {
  try {
    return storage.getItem(firstRunKey) === 'true' ? 'home' : 'guide'
  } catch {
    return 'home'
  }
}

export function completeFirstRun(storage: Pick<Storage, 'setItem'>) {
  try { storage.setItem(firstRunKey, 'true') } catch {}
}
