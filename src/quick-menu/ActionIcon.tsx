import type { ReactNode } from 'react'
import type { ActionIconName } from './quick-actions'

const icons: Record<ActionIconName, ReactNode> = {
  image: <><rect x="3" y="3.5" width="18" height="17" rx="2.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 3.5-4 4.5 5"/></>,
  pdf: <><path d="M7 3.5h7l4 4V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"/><path d="M14 3.5v5h5M8 13h8M8 16h6"/></>,
  resize: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8l-5-5M16 8l5-5M8 16l-5 5M16 16l5 5"/></>,
  rotate: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/></>,
  flip: <><path d="M12 3v18M5 7l4 5-4 5M19 7l-4 5 4 5"/></>,
  tone: <><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18Z"/></>,
  crop: <><path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/></>,
  compress: <><path d="M8 3v6H2M16 3v6h6M8 21v-6H2M16 21v-6h6M8 9l-5-6M16 9l5-6M8 15l-5 6M16 15l5 6"/></>,
  tag: <><path d="M20 13 13 20 4 11V4h7l9 9Z"/><circle cx="8" cy="8" r="1"/></>,
  mute: <><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 9 5 6m0-6-5 6"/></>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4"/></>,
  wave: <><path d="M3 12h2l2-6 4 12 4-12 3 12 2-6h1"/></>,
  archive: <><path d="M4 7h16v13H4zM3 4h18v3H3zM10 11h4"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></>,
  move: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/><path d="M8 13h8m-3-3 3 3-3 3"/></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m9 14 2 2 4-4"/></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/></>,
}

export function ActionIcon({ name, className }: { name: ActionIconName; className: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>
}
