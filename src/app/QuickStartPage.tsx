import { AppIcon } from '../icons/AppIcon'
import type { AppSettings } from '../settings'
import type { MessageKey } from '../i18n'
import { modifierLabel } from './keyboard'

export function QuickStartPage({ preferences, tr, onHome, onChooseFiles }: {
  preferences: AppSettings
  tr: (key: MessageKey) => string
  onHome: () => void
  onChooseFiles: () => void
}) {
  return <div className="page welcome-page">
    <p className="welcome-eyebrow">{tr('Quick start')}</p>
    <h1>{tr('Welcome to FlickVert')}</h1>
    <p className="welcome-intro">{tr('The file tools you need, right where you work.')}</p>
    <div className="welcome-steps">
      <article><span>1</span><div><strong>{tr('Drag while holding the left mouse button.')}</strong><p>{tr('Select a file in Explorer or Finder, then use the shortcut or choose files here.')}</p></div></article>
      <article><span>2</span><div><strong>{tr('Drag modifiers')}</strong><p>{tr('Formats modifier')}: {modifierLabel(preferences.dragModifiers.convert)} · {tr('Tools modifier')}: {modifierLabel(preferences.dragModifiers.tools)} · {tr('File actions modifier')}: {modifierLabel(preferences.dragModifiers.actions)}. {tr('Drop on an available action. Press Escape to cancel.')}</p></div></article>
    </div>
    <div className="welcome-details">
      <div><span>{tr('Your configured shortcut:')}</span><kbd>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : 'Space').join(' + ')}</kbd></div>
      <p>{tr('Your files stay here')} {tr('Processed on this device')}. {tr('Optional engines only enable the formats they support.')}</p>
      <p>{tr('Closing the window keeps FlickVert running in the tray. Use Quit in the tray menu to exit.')}</p>
    </div>
    <div className="welcome-actions">
      <button className="primary-button" onClick={onHome}><AppIcon name="home"/>{tr('Start using FlickVert')}</button>
      <button className="secondary-button" onClick={onChooseFiles}><AppIcon name="file-plus"/>{tr('Choose files')}</button>
    </div>
  </div>
}
