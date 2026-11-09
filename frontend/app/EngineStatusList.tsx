import type { MessageKey } from '../i18n'
import type { Engines } from './types'

const labels: Record<keyof Engines, string> = {
  ffmpeg: 'FFmpeg', pandoc: 'Pandoc', imagemagick: 'ImageMagick', libreoffice: 'LibreOffice',
  poppler: 'Poppler',
}
const defaultOrder: (keyof Engines)[] = ['ffmpeg', 'pandoc', 'imagemagick', 'libreoffice', 'poppler']

export function EngineStatusList({ engines, order = defaultOrder, tr }: {
  engines: Engines
  order?: readonly (keyof Engines)[]
  tr: (key: MessageKey) => string
}) {
  return <div className="engine-status">{order.map((engine) => <div key={engine}>
    <span className="engine-name">{labels[engine]}</span>
    <span className={engines[engine] ? 'engine-found' : ''}>{tr(engines[engine] ? 'Detected' : 'Not detected on PATH')}</span>
  </div>)}</div>
}
