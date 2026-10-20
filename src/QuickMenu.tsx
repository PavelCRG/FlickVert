import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import './quick-menu.css'

const actions = [
  { id: 'convert', label: 'Convert', glyph: '↗' },
  { id: 'resize', label: 'Resize', glyph: '⌗' },
  { id: 'settings', label: 'Preferences', glyph: '⚙' },
]

export default function QuickMenu() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') void getCurrentWindow().hide() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  async function choose(actionId: string) {
    await invoke('quick_action', { actionId })
    await getCurrentWindow().hide()
  }
  return <main className="quick-shell" aria-label="FlickVert quick actions">
    <header><img src="/fv-mark.svg" alt=""/><span>FlickVert</span><kbd>ESC</kbd></header>
    <div className="quick-orbit">
      <div className="quick-center">FV</div>
      {actions.map((action) => <button key={action.id} className={`quick-action ${action.id}`} onClick={() => choose(action.id)}><span>{action.glyph}</span><small>{action.label}</small></button>)}
    </div>
    <footer>Choose an action · Ctrl Alt Space</footer>
  </main>
}
