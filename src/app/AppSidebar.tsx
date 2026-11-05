import { AppIcon } from '../icons/AppIcon'
import type { AppIconName } from '../icons/AppIcon'
import UpdateNotice from '../updates/UpdateNotice'
import type { MessageKey } from '../i18n'

export type Section = 'guide' | 'home' | 'settings' | 'tools'
export type SettingsPage = 'general' | 'appearance' | 'keyboard' | 'conversion' | 'files' | 'about'

const sections: { id: Section; label: MessageKey }[] = [
  { id: 'home', label: 'Home' },
  { id: 'tools', label: 'Tools & formats' },
  { id: 'settings', label: 'Settings' },
  { id: 'guide', label: 'Quick start' },
]

const settingsPages: { id: SettingsPage; label: MessageKey; icon: AppIconName }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'keyboard', label: 'Keyboard', icon: 'keyboard' },
  { id: 'conversion', label: 'Conversion', icon: 'sliders' },
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'about', label: 'About', icon: 'info' },
]

export function AppSidebar({ section, language, setSection, setSettingsPage, tr }: {
  section: Section
  language: 'en' | 'ru' | 'zh'
  setSection: (section: Section) => void
  setSettingsPage: (page: SettingsPage) => void
  tr: (key: MessageKey) => string
}) {
  return <aside className="sidebar">
    <div className="side-label">{tr('Workspace')}</div>
    <nav aria-label="Main navigation">
      {sections.map(({ id, label }) => <button key={id} aria-current={section === id ? 'page' : undefined} className={section === id ? 'nav-item active' : 'nav-item'} onClick={() => { setSection(id); if (id === 'settings') setSettingsPage('general') }}><AppIcon name={id} className="nav-icon"/><span>{tr(label)}</span></button>)}
    </nav>
    <div className="sidebar-bottom">
      <UpdateNotice language={language}/>
      <div className="privacy"><span className="privacy-icon-wrap"><AppIcon name="shield-check" className="privacy-icon"/></span><span><strong>{tr('Your files stay here')}</strong><small>{tr('Processed on this device')}</small></span></div>
      <div className="version">FlickVert <span>0.1.5</span></div>
    </div>
  </aside>
}

export function SettingsNavigation({ settingsPage, setSettingsPage, tr }: {
  settingsPage: SettingsPage
  setSettingsPage: (page: SettingsPage) => void
  tr: (key: MessageKey) => string
}) {
  return <nav className="settings-page-nav" aria-label={tr('Settings')}>
    {settingsPages.map(({ id, label, icon }) => <button key={id} type="button" aria-current={settingsPage === id ? 'page' : undefined} className={settingsPage === id ? 'nav-item active' : 'nav-item'} onClick={() => setSettingsPage(id)}><AppIcon name={icon} className="nav-icon"/>{tr(label)}</button>)}
  </nav>
}
