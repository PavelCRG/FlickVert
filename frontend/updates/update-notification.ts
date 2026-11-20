export function shouldNotifyUpdate(version: string, notifiedVersion: string | null) {
  return Boolean(version) && version !== notifiedVersion
}

export type UpdateStatus = 'checking' | 'current' | 'available' | 'downloading' | 'error' | 'unsupported'

export function updateActionForStatus(status: UpdateStatus) {
  if (status === 'available') return 'install'
  if (status === 'current' || status === 'error') return 'check'
  return null
}
