export function normalizeWatermarkTemplates(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((item) => {
    if (typeof item !== 'string') return []
    const text = item.trim().slice(0, 300)
    const key = text.toLocaleLowerCase()
    if (!text || seen.has(key)) return []
    seen.add(key)
    return [text]
  }).slice(-12)
}

export function saveWatermarkTemplate(templates: string[], value: string): string[] {
  const text = value.trim().slice(0, 300)
  if (!text) return normalizeWatermarkTemplates(templates)
  return normalizeWatermarkTemplates([...templates.filter((template) => template.toLocaleLowerCase() !== text.toLocaleLowerCase()), text])
}

export function removeWatermarkTemplate(templates: string[], value: string): string[] {
  return normalizeWatermarkTemplates(templates).filter((template) => template !== value)
}
