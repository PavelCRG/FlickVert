import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { MessageKey } from '../i18n'
import { engineGuides } from './engine-guides'

export function EngineInstallLinks({ engine, tr }: { engine: string; tr: (key: MessageKey) => string }) {
  const guides = engineGuides(engine)
  return <>{guides.map(({ name, url }) => <a key={name} href={url} target="_blank" rel="noreferrer" onClick={(event) => { if (!isTauri()) return; event.preventDefault(); void openUrl(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer')) }}>{tr('Manual installation')}{guides.length > 1 ? `: ${name}` : ''}</a>)}</>
}
