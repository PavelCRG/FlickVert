import type { CSSProperties, ReactNode } from 'react'
import { accentColors, type AccentColor } from '../settings'
import { type MessageKey } from '../i18n'

type Segment<Value extends string> = { value: Value; label: string }

export const sizePresets = [
  { id: 'hd', name: 'HD', width: 1280, height: 720 },
  { id: 'full-hd', name: 'Full HD', width: 1920, height: 1080 },
  { id: 'qhd', name: 'QHD', width: 2560, height: 1440 },
  { id: '4k', name: '4K', width: 3840, height: 2160 },
  { id: 'square', name: 'Square', width: 1080, height: 1080 },
] as const

export function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="setting-row"><span>{label}</span>{children}</div>
}

export function SegmentedControl<Value extends string>({ label, value, options, onChange }: {
  label: string
  value: Value
  options: Segment<Value>[]
  onChange: (value: Value) => void
}) {
  return <div className="segmented-control" role="group" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} className={value === option.value ? 'selected' : ''} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>
}

export function AccentPicker({ label, value, customValue, onChange, tr }: {
  label: string
  value: AccentColor
  customValue?: string
  onChange: (value: AccentColor, custom?: string) => void
  tr: (key: MessageKey) => string
}) {
  const options: { value: AccentColor; label: MessageKey }[] = [
    { value: 'orange', label: 'Orange' }, { value: 'blue', label: 'Blue' }, { value: 'violet', label: 'Violet' }, { value: 'teal', label: 'Teal' },
    { value: 'green', label: 'Green' }, { value: 'rose', label: 'Rose' },
  ]
  return <div className="accent-picker" role="group" aria-label={label}>
    {options.map((option) => <button
      key={option.value}
      type="button"
      className={value === option.value && !customValue ? 'accent-swatch selected' : 'accent-swatch'}
      style={{ '--swatch': accentColors[option.value] } as CSSProperties}
      aria-label={`${label}: ${tr(option.label)}`}
      aria-pressed={value === option.value && !customValue}
      title={tr(option.label)}
      onClick={() => onChange(option.value)}
    ><span aria-hidden="true"/></button>)}
    <label className="custom-accent" title={tr('Custom color')}><input aria-label={tr('Custom color')} type="color" value={customValue || accentColors[value]} onChange={(event) => onChange(value, event.target.value)}/><span>{tr('Custom color')}</span></label>
  </div>
}
