import type { ReactNode } from 'react'

export type AppIconName =
  | 'home' | 'tools' | 'settings' | 'guide' | 'image' | 'image-edit' | 'pdf' | 'pdf-merge' | 'pdf-split' | 'pdf-pages' | 'document' | 'audio'
  | 'resize' | 'rotate' | 'flip' | 'tone' | 'crop' | 'compress' | 'tag' | 'mute' | 'music' | 'film' | 'wave'
  | 'archive' | 'copy' | 'move' | 'folder' | 'terminal' | 'convert' | 'shield-check'
  | 'minimize' | 'maximize' | 'close' | 'chevron-down' | 'check' | 'refresh' | 'alert' | 'download' | 'restart' | 'file-plus'
  | 'palette' | 'keyboard' | 'sliders' | 'info' | 'arrow-right' | 'search' | 'star'

const icons: Record<AppIconName, ReactNode> = {
  home: <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-5v-6h-4v6H5a2 2 0 0 1-2-2z"/>,
  tools: <><path d="M4 5h16v14H4z"/><path d="m7 9 2-2 2 2m2 0h2M7 13h10M7 16h5"/></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></>,
  guide: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4.1 2.1c-1 .7-1.6 1.1-1.6 2.4M12 17h.01"/></>,
  image: <><rect x="3" y="3.5" width="18" height="17" rx="2.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 3.5-4 4.5 5"/></>,
  'image-edit': <><rect x="2.5" y="3.5" width="15" height="17" rx="2.5"/><circle cx="7.5" cy="9" r="1.5"/><path d="m3.5 18 4-4 2.5 2.5"/><path d="m13 15 5.7-5.7a2.1 2.1 0 0 1 3 3L16 18l-3.5.8z"/></>,
  pdf: <><path d="M6 3h8l5 5v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M7 14h10M7 17h7"/></>,
  'pdf-merge': <><path d="M5 3h8l4 4v5M13 3v4h4M5 12v8a1 1 0 0 0 1 1h7"/><path d="M10 16h11m-4-4 4 4-4 4"/></>,
  'pdf-split': <><path d="M6 3h8l4 4v5M14 3v4h4M6 11v10"/><path d="M6 13h11m-4-4 4 4-4 4M6 19h11m-4-4 4 4-4 4"/></>,
  'pdf-pages': <><path d="M6 3h8l4 4v4M14 3v4h4M6 11v10"/><path d="M10 14h10m-3-3 3 3-3 3M10 19h10"/></>,
  document: <><path d="M6 3h8l5 5v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></>,
  audio: <><path d="M3 12h2l2-6 4 12 4-12 3 12 2-6h1"/></>,
  resize: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8 3 3m13 5 5-5M8 16l-5 5m13-5 5 5"/></>,
  rotate: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/></>,
  flip: <><path d="M12 3v18M5 7l4 5-4 5m14-10-4 5 4 5"/></>,
  tone: <><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18Z"/></>,
  crop: <><path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12"/></>,
  compress: <><path d="M8 3v6H2m14-6v6h6M8 21v-6H2m14 6v-6h6"/><path d="m8 9-5-6m13 6 5-6M8 15l-5 6m13-6 5 6"/></>,
  tag: <><path d="M20 13 13 20 4 11V4h7l9 9Z"/><circle cx="8" cy="8" r="1"/></>,
  mute: <><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 9 5 6m0-6-5 6"/></>,
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4"/></>,
  wave: <path d="M3 12h2l2-6 4 12 4-12 3 12 2-6h1"/>,
  archive: <><path d="M4 7h16v13H4zM3 4h18v3H3zM10 11h4"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></>,
  move: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/><path d="M8 13h8m-3-3 3 3-3 3"/></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m9 14 2 2 4-4"/></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/></>,
  convert: <><path d="M4 7h13l-3-3m6 13H7l3 3"/><path d="M17 4v3m-7 10v3"/></>,
  'shield-check': <><path d="m12 3 8 3v5.5c0 5-3.4 8.3-8 10.5-4.6-2.2-8-5.5-8-10.5V6z"/><path d="m8.5 11.5 2.3 2.3 4.8-5"/></>,
  minimize: <path d="M4 12h16"/>,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  'chevron-down': <path d="m6 9 6 6 6-6"/>,
  check: <path d="m4 12 5 5L20 6"/>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/></>,
  alert: <><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></>,
  download: <><path d="M12 3v11m-4-4 4 4 4-4M5 17v3h14v-3"/></>,
  restart: <><path d="M20 7v5h-5"/><path d="M20 12a8 8 0 1 1-2.3-5.7L20 9"/></>,
  'file-plus': <><path d="M6 3h8l5 5v6M14 3v5h5M6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/><path d="M17 16v6m-3-3h6"/></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3.1H18a3 3 0 0 0 3-3A8.5 8.5 0 0 0 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8"/></>,
  sliders: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
  'arrow-right': <path d="M4 12h16m-6-6 6 6-6 6"/>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
}

export function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>
}
