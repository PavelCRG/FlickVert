export function shouldNotifyUpdate(version: string, notifiedVersion: string | null) {
  return Boolean(version) && version !== notifiedVersion
}
