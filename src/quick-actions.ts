export function canRunSelectedTool(actionId: string, actionIds: string[], fileCount: number) {
  return fileCount > 0 && actionIds.includes(actionId)
}
