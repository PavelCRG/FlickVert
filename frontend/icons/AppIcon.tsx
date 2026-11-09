import {
  Archive, ArrowLeftRight, ArrowRight, AudioLines, AudioWaveform, Check, ChevronDown, CircleAlert, CircleHelp,
  Contrast, Copy, Crop, Download, ExternalLink, FilePlus, FileText, Files, Film, FlipHorizontal, Folder, FolderInput,
  House, Image, ImagePlus, Info, Keyboard, Maximize2, Minimize2, Minus, Music2, Palette, PanelsTopLeft, RefreshCw,
  RotateCcw, RotateCw, Scissors, Search, Settings2, ShieldCheck, SlidersHorizontal, Square, SquareTerminal, Star,
  Tag, VolumeX, Wrench, X, type LucideIcon,
} from 'lucide-react'

export type AppIconName =
  | 'home' | 'tools' | 'settings' | 'guide' | 'image' | 'image-edit' | 'pdf' | 'pdf-merge' | 'pdf-split' | 'pdf-pages' | 'document' | 'audio'
  | 'resize' | 'rotate' | 'flip' | 'tone' | 'crop' | 'compress' | 'tag' | 'mute' | 'music' | 'film' | 'wave'
  | 'archive' | 'copy' | 'move' | 'folder' | 'terminal' | 'convert' | 'shield-check'
  | 'minimize' | 'maximize' | 'close' | 'chevron-down' | 'check' | 'refresh' | 'alert' | 'download' | 'restart' | 'file-plus'
  | 'palette' | 'keyboard' | 'sliders' | 'info' | 'arrow-right' | 'external-link' | 'search' | 'star'

const icons: Record<AppIconName, LucideIcon> = {
  home: House, tools: Wrench, settings: Settings2, guide: CircleHelp, image: Image, 'image-edit': ImagePlus,
  pdf: FileText, 'pdf-merge': Files, 'pdf-split': Scissors, 'pdf-pages': PanelsTopLeft, document: FileText,
  audio: AudioLines, resize: Maximize2, rotate: RotateCw, flip: FlipHorizontal, tone: Contrast, crop: Crop,
  compress: Minimize2, tag: Tag, mute: VolumeX, music: Music2, film: Film, wave: AudioWaveform,
  archive: Archive, copy: Copy, move: FolderInput, folder: Folder, terminal: SquareTerminal,
  convert: ArrowLeftRight, 'shield-check': ShieldCheck, minimize: Minus, maximize: Square, close: X,
  'chevron-down': ChevronDown, check: Check, refresh: RefreshCw, alert: CircleAlert, download: Download,
  restart: RotateCcw, 'file-plus': FilePlus, palette: Palette, keyboard: Keyboard, sliders: SlidersHorizontal,
  info: Info, 'arrow-right': ArrowRight, 'external-link': ExternalLink, search: Search, star: Star,
}

export function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  const Icon = icons[name]
  return <Icon className={className} size={24} strokeWidth={1.7} aria-hidden="true"/>
}
