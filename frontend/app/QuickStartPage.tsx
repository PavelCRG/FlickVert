import { AppIcon } from '../icons/AppIcon'
import type { MessageKey } from '../i18n'

export function QuickStartPage({ tr, onHome, onChooseFiles }: {
  tr: (key: MessageKey) => string
  onHome: () => void
  onChooseFiles: () => void
}) {
  return <div className="page welcome-page">
    <p className="welcome-eyebrow">{tr('Quick start')}</p>
    <h1>{tr('Welcome to FlickVert')}</h1>
    <p className="welcome-intro">{tr('Choose a file to get started')}</p>
    <div className="welcome-steps">
      <article><span>1</span><div><strong>{tr('Choose files')}</strong><p>{tr('Click below to browse or drag a file from File Explorer.')}</p></div></article>
      <article><span>2</span><div><strong>{tr('Pick a compatible action')}</strong><p>{tr('FlickVert shows actions for your file. Built-in tools work immediately.')}</p></div></article>
      <article><span>3</span><div><strong>{tr('Save your result')}</strong><p>{tr('Choose a format and location. The original file stays unchanged.')}</p></div></article>
    </div>
    <div className="welcome-details">
      <p>{tr('FlickVert shows actions for your file. Built-in tools work immediately.')}</p>
    </div>
    <div className="welcome-actions">
      <button className="primary-button" onClick={onChooseFiles}><AppIcon name="file-plus"/>{tr('Choose files')}</button>
      <button className="secondary-button" onClick={onHome}><AppIcon name="home"/>{tr('Start using FlickVert')}</button>
    </div>
  </div>
}
