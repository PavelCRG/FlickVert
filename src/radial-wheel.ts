const size = 352
const center = size / 2
const innerRadius = 80
const outerRadius = 174

const point = (angle: number, radius: number) => [
  Number((center + Math.cos(angle) * radius).toFixed(2)),
  Number((center + Math.sin(angle) * radius).toFixed(2)),
]

export function wheelSlicePath(index: number, count: number) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index >= count) return ''
  const step = Math.PI * 2 / count
  const half = step / 2
  const gap = Math.min(0.035, step * 0.12)
  const start = -Math.PI / 2 + index * step - half + gap
  const end = -Math.PI / 2 + index * step + half - gap
  const [ix1, iy1] = point(start, innerRadius)
  const [ox1, oy1] = point(start, outerRadius)
  const [ox2, oy2] = point(end, outerRadius)
  const [ix2, iy2] = point(end, innerRadius)
  const largeArc = step - gap * 2 > Math.PI ? 1 : 0
  return `M${ix1} ${iy1} L${ox1} ${oy1} A${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${ox2} ${oy2} L${ix2} ${iy2} A${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`
}

export function wheelLabelPosition(index: number, count: number) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / count
  const radius = (innerRadius + outerRadius) / 2
  return {
    left: `${Number((50 + Math.cos(angle) * radius / size * 100).toFixed(2))}%`,
    top: `${Number((50 + Math.sin(angle) * radius / size * 100).toFixed(2))}%`,
  }
}
