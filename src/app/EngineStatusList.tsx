import type { MessageKey } from '../i18n'
import type { Engines } from './types'
import { EngineInstallNote } from './EngineInstallNote'

const labels: Record<keyof Engines, string> = {
  ffmpeg: 'FFmpeg', pandoc: 'Pandoc', imagemagick: 'ImageMagick', libreoffice: 'LibreOffice',
  poppler: 'Poppler', pdfunite: 'PDF merge (pdfunite)', pdfsplit: 'PDF split (Poppler)', qpdf: 'PDF page editor (qpdf)',
}
const installNames: Record<keyof Engines, string> = {
  ffmpeg: 'FFmpeg', pandoc: 'Pandoc', imagemagick: 'ImageMagick', libreoffice: 'LibreOffice',
  poppler: 'Poppler', pdfunite: 'Poppler', pdfsplit: 'Poppler', qpdf: 'qpdf',
}
const defaultOrder: (keyof Engines)[] = ['ffmpeg', 'pandoc', 'imagemagick', 'libreoffice', 'poppler', 'pdfunite', 'pdfsplit', 'qpdf']

export function EngineStatusList({ engines, order = defaultOrder, tr }: {
  engines: Engines
  order?: readonly (keyof Engines)[]
  tr: (key: MessageKey) => string
}) {
  return <div className="engine-status">{order.map((engine) => <div key={engine}>
    <span className="engine-name">{engine === 'pdfunite' || engine === 'pdfsplit' || engine === 'qpdf' ? tr(labels[engine] as MessageKey) : labels[engine]}</span>
    <span className={engines[engine] ? 'engine-found' : ''}>{tr(engines[engine] ? 'Detected' : 'Not detected on PATH')}</span>
    <span className="engine-install">{!engines[engine] && <EngineInstallNote engine={installNames[engine]} tr={tr}/>}</span>
  </div>)}</div>
}
