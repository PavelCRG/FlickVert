import { useRef, type CSSProperties } from 'react'
import { AppIcon } from '../icons/AppIcon'
import type { MessageKey } from '../i18n'
import { accentColors, type AppSettings } from '../settings'
import { fileActionsForPlatform, moveWheelAction, orderWheelActions } from '../quick-menu/quick-actions'
import { wheelLabelPosition, wheelSlicePath } from '../quick-menu/radial-wheel'
import './wheel-editor.css'

export function WheelEditor({ preferences, updatePreferences, recordingAction, shortcutError, onRecordShortcut, tr }: {
  preferences: AppSettings
  updatePreferences: (patch: Partial<AppSettings>) => void
  recordingAction: string | null
  shortcutError: boolean
  onRecordShortcut: (actionId: string) => void
  tr: (key: MessageKey) => string
}) {
  const dragged = useRef<string | null>(null)
  const actions = fileActionsForPlatform(navigator.userAgent.includes('Windows'))
  const selectedIds = preferences.fileWheelActions ?? actions.map((action) => action.id)
  const selected = orderWheelActions(actions, selectedIds)
  const saveOrder = (ids: string[]) => updatePreferences({ fileWheelActions: ids })
  const add = (id: string) => { if (!selectedIds.includes(id)) saveOrder([...selectedIds, id]) }
  const dropOn = (targetId?: string) => {
    if (!dragged.current) return
    if (selectedIds.includes(dragged.current) || selectedIds.length < 12) saveOrder(moveWheelAction(selectedIds, dragged.current, targetId))
    dragged.current = null
  }
  const shortcuts = preferences.operationShortcuts ?? {}

  return <section className="wheel-editor" aria-label={tr('Action wheel')}>
    <div className="wheel-editor-toolbar"><button type="button" className="secondary-button" onClick={() => { updatePreferences({ fileWheelActions: undefined, wheelColor: undefined }) }}>{tr('Reset wheel')}</button></div>
    <div className="wheel-editor-layout">
      <section className="wheel-editor-stage" aria-label={tr('Wheel preview')}>
        <div className="wheel-editor-preview" style={{ '--wheel-accent-base': preferences.wheelColor ?? '#315fce' } as CSSProperties}>
          <svg className="wheel-editor-segments" viewBox="0 0 352 352" aria-hidden="true">{selected.map((action, index) => <path key={action.id} d={wheelSlicePath(index, selected.length)}/>)}</svg>
          <div className="wheel-editor-labels" aria-hidden="true">{selected.map((action, index) => <span key={action.id} style={wheelLabelPosition(index, selected.length)}><AppIcon name={action.glyph}/><small>{tr(action.label)}</small></span>)}</div>
          <div className="wheel-editor-hub">FlickVert</div>
        </div>
        <p className="wheel-editor-count">{selected.length} / 12 {tr('actions selected')}</p>
        <div className="wheel-color-picker"><span>{tr('Wheel color')}</span><div className="wheel-color-swatches">{Object.entries(accentColors).map(([name, color]) => <button key={name} type="button" aria-label={tr(name[0].toUpperCase() + name.slice(1) as MessageKey)} aria-pressed={(preferences.wheelColor ?? '#315fce').toLowerCase() === color.toLowerCase()} style={{ '--swatch': color } as CSSProperties} onClick={() => updatePreferences({ wheelColor: color })}/>)}</div><input type="color" aria-label={tr('Custom color')} value={preferences.wheelColor ?? '#315fce'} onChange={(event) => updatePreferences({ wheelColor: event.target.value })}/></div>
      </section>

      <section className="wheel-editor-list" aria-label={tr('Wheel actions')} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn()}>
        <h2>{tr('Wheel actions')}</h2>
        {selected.length === 0 ? <div className="wheel-editor-empty">{tr('Drop actions here or add them from the list.')}</div> : selected.map((action, index) => <div key={action.id} className="wheel-editor-item" draggable onDragStart={() => { dragged.current = action.id }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); dropOn(action.id) }}>
          <span className="wheel-editor-grip" aria-hidden="true"/><AppIcon name={action.glyph}/><span className="wheel-editor-label">{tr(action.label)}</span>
          <button type="button" className="wheel-editor-bind" onClick={() => onRecordShortcut(action.id)} aria-pressed={recordingAction === action.id}>{recordingAction === action.id ? tr('Press a shortcut...') : shortcuts[action.id] ?? tr('Not assigned')}</button>
          <button type="button" className="wheel-editor-order" disabled={index === 0} aria-label={`${tr('Move up')}: ${tr(action.label)}`} onClick={() => saveOrder(moveWheelAction(selectedIds, action.id, selectedIds[index - 1]))}><AppIcon name="arrow-right"/></button>
          <button type="button" className="wheel-editor-order" disabled={index === selected.length - 1} aria-label={`${tr('Move down')}: ${tr(action.label)}`} onClick={() => saveOrder(moveWheelAction(selectedIds, action.id, selectedIds[index + 1], true))}><AppIcon name="arrow-right"/></button>
          <button type="button" className="wheel-editor-remove" aria-label={`${tr('Remove from wheel')}: ${tr(action.label)}`} onClick={() => saveOrder(selectedIds.filter((id) => id !== action.id))}><AppIcon name="close"/></button>
          <span className="wheel-editor-position">{index + 1}</span>
        </div>)}
        {shortcutError && <p className="shortcut-error" role="alert">{tr('Operation shortcut conflicts or is unavailable.')}</p>}
      </section>

      <section className="wheel-editor-catalog" aria-label={tr('Available actions')}>
        <h2>{tr('Available actions')}</h2>
        {actions.map((action) => <div key={action.id} className="wheel-editor-catalog-item" draggable={!selectedIds.includes(action.id)} onDragStart={() => { dragged.current = action.id }}>
          <AppIcon name={action.glyph}/><span>{tr(action.label)}</span>
          <button type="button" disabled={selectedIds.includes(action.id) || selectedIds.length >= 12} onClick={() => add(action.id)} aria-label={`${tr('Add to wheel')}: ${tr(action.label)}`}>{tr(selectedIds.includes(action.id) ? 'Added' : 'Add')}</button>
        </div>)}
      </section>
    </div>
  </section>
}
