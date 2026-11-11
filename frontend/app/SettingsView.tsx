import { useState, type ChangeEvent, type RefObject } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification'
import { AppIcon } from '../icons/AppIcon'
import type { MessageKey } from '../i18n'
import { quickMenuThemeValues, resetSettingsSection, type AppSettings } from '../settings'
import { AccentPicker, SegmentedControl, SettingsRow, sizePresets } from '../settings/SettingsControls'
import { modifierLabel } from './keyboard'
import { operationShortcutActions } from '../quick-menu/quick-actions'
import { WheelEditor } from './WheelEditor'
import { purposeProfiles } from '../settings/profiles'
import { applyConversionProfile, removeConversionProfile, saveConversionProfile } from '../settings/conversion-profiles'
import type { Section, SettingsPage } from './AppSidebar'

type SettingsViewProps = {
  settingsPage: SettingsPage; preferences: AppSettings; tr: (key: MessageKey) => string; pickError: boolean
  shortcutError: boolean; operationShortcutError: boolean; modifierError: boolean; recordingShortcut: boolean; recordingOperationShortcut: string | null
  startupError: boolean; setStartupError: (error: boolean) => void
  setRecordingShortcut: (recording: boolean) => void; setRecordingOperationShortcut: (actionId: string | null) => void; setShortcutError: (error: boolean) => void; setOperationShortcutError: (error: boolean) => void
  updatePreferences: (patch: Partial<AppSettings>) => void; updateShortcut: (shortcut: string) => Promise<void>; updateOperationShortcut: (actionId: string, shortcut?: string) => Promise<void>
  updateDragModifier: (mode: 'convert' | 'tools' | 'actions', value: 'SHIFT' | 'CTRL' | 'ALT') => void
  setSection: (section: Section) => void; chooseOutputFolder: () => Promise<void>
  selectedDimensionPreset: string
  setSelectedDimensionPreset: (preset: string) => void; applyDimensionPreset: (preset: string) => void
  saveDimensionPreset: () => void; removeDimensionPreset: () => void; presetName: string
  setPresetName: (name: string) => void; presetSaved: boolean; setPresetSaved: (saved: boolean) => void
  exportSettings: () => void; importSettings: (event: ChangeEvent<HTMLInputElement>) => void
  settingsImportInput: RefObject<HTMLInputElement | null>; settingsImportError: boolean
}

export function SettingsView(props: SettingsViewProps) {
  const [closeError, setCloseError] = useState(false)
  const [notificationError, setNotificationError] = useState(false)
  const [contextMenuError, setContextMenuError] = useState(false)
  const [conversionProfileName, setConversionProfileName] = useState('')
  const [selectedConversionProfile, setSelectedConversionProfile] = useState('')
  const { settingsPage, preferences, tr, pickError, shortcutError, operationShortcutError, modifierError, recordingShortcut, recordingOperationShortcut, startupError, setStartupError, setRecordingShortcut, setRecordingOperationShortcut, setShortcutError, setOperationShortcutError, updatePreferences, updateShortcut, updateOperationShortcut, updateDragModifier, setSection, chooseOutputFolder, selectedDimensionPreset, setSelectedDimensionPreset, applyDimensionPreset, saveDimensionPreset, removeDimensionPreset, presetName, setPresetName, presetSaved, setPresetSaved, exportSettings, importSettings, settingsImportInput, settingsImportError } = props
  const shellIntegrationSupported = isTauri() && /Win|Mac/.test(navigator.platform)
  return <div className="page settings-page" data-page={settingsPage}>
        <header className="settings-header">
          <div><p className="welcome-eyebrow">{tr('Settings')}</p><h1>{tr(settingsPage === 'general' ? 'General' : settingsPage === 'wheel' ? 'Action wheel' : settingsPage === 'appearance' ? 'Appearance' : settingsPage === 'keyboard' ? 'Keyboard' : settingsPage === 'conversion' ? 'Conversion' : settingsPage === 'files' ? 'Files' : 'About')}</h1>{settingsPage === 'wheel' && <p className="subtitle">{tr('Choose actions, arrange the circle, and set shortcuts.')}</p>}</div>
        </header>
        {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}

        {settingsPage === 'general' && <section className="settings-group" aria-labelledby="general-title">
          <h2 id="general-title">{tr('General')}</h2>
          <div className="setting-row"><span className="setting-copy"><span>{tr('Quick start')}</span><small>{tr('Review the main gestures and shortcuts.')}</small></span><button className="secondary-button" onClick={() => setSection('guide')}><AppIcon name="guide"/>{tr('Show quick start')}</button></div>
          {isTauri() && <label className="setting-row"><span className="setting-copy"><span>{tr('Desktop notifications')}</span><small>{tr('Notify when background conversions finish.')}</small></span><input type="checkbox" checked={preferences.desktopNotifications} onChange={(event) => { const enabled = event.target.checked; setNotificationError(false); if (!enabled) { updatePreferences({ desktopNotifications: false }); return } void (async () => { try { let granted = await isPermissionGranted(); if (!granted) granted = await requestPermission() === 'granted'; if (!granted) throw new Error('Notification permission denied'); updatePreferences({ desktopNotifications: true }) } catch { setNotificationError(true) } })() }}/></label>}
          {notificationError && <p className="shortcut-error" role="alert">{tr('Could not enable desktop notifications.')}</p>}
          <p className="catalog-note">{tr('Closing the window keeps FlickVert running in the tray. Use Quit in the tray menu to exit.')}</p>
          {isTauri() && <label className="setting-row"><span className="setting-copy"><span>{tr('Ask before quitting when closing the window')}</span><small>{tr('Closing normally keeps FlickVert in the tray.')}</small></span><input type="checkbox" checked={preferences.confirmQuitOnClose} onChange={(event) => { const enabled = event.target.checked; setCloseError(false); void invoke('set_confirm_quit_on_close', { enabled }).then(() => updatePreferences({ confirmQuitOnClose: enabled })).catch(() => setCloseError(true)) }}/></label>}
          {closeError && <p className="shortcut-error" role="alert">{tr('Could not update close behavior.')}</p>}
          <SettingsRow label={tr('Preferred Windows terminal')} description={tr('Used when an action opens a terminal.')}><select className="modifier-select" aria-label={tr('Preferred Windows terminal')} value={preferences.terminalPreference} onChange={(event) => updatePreferences({ terminalPreference: event.target.value as AppSettings['terminalPreference'] })}><option value="windows-terminal">Windows Terminal</option><option value="powershell">PowerShell</option></select></SettingsRow>
          {shellIntegrationSupported && <label className="setting-row"><span className="setting-copy"><span>{tr('Launch FlickVert when I sign in')}</span><small>{tr('Start automatically after you sign in.')}</small></span><input type="checkbox" checked={preferences.launchAtStartup} onChange={(event) => { const enabled = event.target.checked; setStartupError(false); void invoke('set_startup_enabled', { enabled }).then(() => updatePreferences({ launchAtStartup: enabled, launchAtStartupConfigured: true })).catch(() => setStartupError(true)) }}/></label>}
          {startupError && <p className="shortcut-error" role="alert">{tr('Could not change startup settings.')}</p>}
          {shellIntegrationSupported && <label className="setting-row"><span className="setting-copy"><span>{tr('Add FlickVert to file context menu')}</span><small>{tr('Open FlickVert actions from File Explorer.')}</small></span><input type="checkbox" checked={preferences.contextMenuEnabled} onChange={(event) => { const enabled = event.target.checked; setContextMenuError(false); void invoke('set_context_menu_enabled', { enabled }).then(() => updatePreferences({ contextMenuEnabled: enabled })).catch(() => setContextMenuError(true)) }}/></label>}
          {contextMenuError && <p className="shortcut-error" role="alert">{tr('Could not change context menu settings.')}</p>}
        </section>}

        {settingsPage === 'wheel' && <WheelEditor preferences={preferences} updatePreferences={updatePreferences} recordingAction={recordingOperationShortcut} shortcutError={operationShortcutError} onRecordShortcut={setRecordingOperationShortcut} tr={tr}/>}

        {settingsPage === 'appearance' && <section className="settings-group"><h2>{tr('Appearance')}</h2>
          <SettingsRow label={tr('Appearance')} description={tr('Follow your system theme or choose one.')}><SegmentedControl label={tr('Appearance')} value={preferences.appearance} options={(['system', 'light', 'dark'] as const).map((value) => ({ value, label: tr(value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark') }))} onChange={(appearance) => updatePreferences({ appearance })}/></SettingsRow>
          <SettingsRow label={tr('Accent color')} description={tr('Choose a preset or set a custom color.')}><AccentPicker label={tr('Accent color')} value={preferences.accent} customValue={preferences.customAccent} onChange={(accent, customAccent) => updatePreferences(customAccent ? { accent, customAccent } : { accent, customAccent: undefined })} tr={tr}/></SettingsRow>
          <h3>{tr('Quick menu theme')}</h3>
          <SettingsRow label={tr('Theme preset')}><select className="modifier-select" aria-label={tr('Theme preset')} value={preferences.quickMenuTheme} onChange={(event) => updatePreferences(quickMenuThemeValues(event.target.value as AppSettings['quickMenuTheme']))}><option value="default">{tr('Default')}</option><option value="transparent">{tr('Fully transparent')}</option><option value="custom">{tr('Custom')}</option></select></SettingsRow>
          {([['quickMenuBackground', 'Circle background'], ['quickMenuSector', 'Sectors'], ['quickMenuActive', 'Active sector'], ['quickMenuText', 'Text and icons']] as const).map(([field, label]) => <SettingsRow key={field} label={tr(label as never)}><input aria-label={tr(label as never)} type="color" value={preferences[field]} onChange={(event) => updatePreferences({ ...(preferences.quickMenuTheme === 'transparent' ? quickMenuThemeValues('custom') : {}), quickMenuTheme: 'custom', [field]: event.target.value } as Partial<AppSettings>)}/></SettingsRow>)}
          {([['quickMenuBackgroundOpacity', 'Circle background opacity'], ['quickMenuSectorOpacity', 'Sector opacity']] as const).map(([field, label]) => <SettingsRow key={field} label={`${tr(label as never)} · ${preferences[field]}%`}><input aria-label={tr(label as never)} type="range" min="0" max="100" value={preferences[field]} onChange={(event) => updatePreferences({ quickMenuTheme: 'custom', [field]: Number(event.target.value) } as Partial<AppSettings>)}/></SettingsRow>)}
          <SettingsRow label={tr('Language')} description={tr('Choose the language used across FlickVert.')}><SegmentedControl label={tr('Language')} value={preferences.language} options={(['en', 'ru', 'zh'] as const).map((value) => ({ value, label: tr(value === 'en' ? 'English' : value === 'ru' ? 'Russian' : 'Chinese') }))} onChange={(language) => updatePreferences({ language })}/></SettingsRow>
          <SettingsRow label={tr('Reset appearance settings')}><button className="secondary-button" onClick={() => updatePreferences(resetSettingsSection('appearance'))}>{tr('Reset')}</button></SettingsRow>
        </section>}

        {settingsPage === 'keyboard' && <section className="settings-group" aria-labelledby="shortcut-title">
          <h2 id="shortcut-title">{tr('Keyboard')}</h2>
          <div className="setting-row"><span>{tr('Quick shortcut presets')}</span><details className="shortcut-dropdown" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false }} onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && event.currentTarget.open) {
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.shortcut-options button'))
              const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (current + 1) % buttons.length : (current <= 0 ? buttons.length - 1 : current - 1)
              event.preventDefault(); buttons[next]?.focus()
            }
          }}>
            <summary aria-label={`${tr('Quick shortcut')}: ${preferences.shortcut.replaceAll('+', ' + ')}`}><span>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : 'Space').join(' + ')}</span><AppIcon name="chevron-down"/></summary>
            <div className="shortcut-options">{[['CTRL+ALT+SPACE', 'Ctrl + Alt + Space'], ['CTRL+SHIFT+SPACE', 'Ctrl + Shift + Space'], ['ALT+SHIFT+SPACE', 'Alt + Shift + Space']].map(([value, label]) => <button type="button" key={value} aria-pressed={preferences.shortcut === value} onClick={(event) => { const dropdown = event.currentTarget.closest('details'); dropdown?.removeAttribute('open'); dropdown?.querySelector('summary')?.focus(); void updateShortcut(value) }}><span>{label}</span>{preferences.shortcut === value && <AppIcon name="check"/>}</button>)}</div>
          </details></div>
          <div className="setting-row"><span>{tr('Custom shortcut')}</span><div className="shortcut-recorder"><kbd>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : key === 'SPACE' ? 'Space' : key).join(' + ')}</kbd><button className="secondary-button" onClick={() => { setShortcutError(false); setRecordingOperationShortcut(null); setRecordingShortcut(true) }}>{tr(recordingShortcut ? 'Press a shortcut...' : 'Change shortcut')}</button></div></div>
          {recordingShortcut && <p className="catalog-note" role="status">{tr('Press a shortcut with Ctrl or Alt. Shift may be added. Escape cancels.')}</p>}
          {shortcutError && <p className="shortcut-error">{tr('Shortcut unavailable. Use the tray menu.')}</p>}
          <p className="catalog-note">{tr('The shortcut opens the quick action wheel.')}</p>
          {isTauri() && <section className="operation-shortcuts" aria-label={tr('Operation shortcuts')}>
            <h3>{tr('Operation shortcuts')}</h3>
            {operationShortcutActions.map((action) => {
              const shortcut = preferences.operationShortcuts[action.id]
              return <div className="setting-row" key={action.id}><span>{tr(action.label)}</span><div className="shortcut-recorder">{shortcut ? <kbd>{shortcut.split('+').join(' + ')}</kbd> : <span className="catalog-note">{tr('Not assigned')}</span>}<button className="secondary-button" onClick={() => { setRecordingShortcut(false); setRecordingOperationShortcut(action.id); setOperationShortcutError(false) }}>{tr(recordingOperationShortcut === action.id ? 'Press a shortcut...' : 'Change shortcut')}</button>{shortcut && <button className="secondary-button" aria-label={`${tr('Remove shortcut')}: ${tr(action.label)}`} onClick={() => void updateOperationShortcut(action.id)}><AppIcon name="close"/></button>}</div></div>
            })}
            {recordingOperationShortcut && <p className="catalog-note" role="status">{tr('Press a shortcut with Ctrl or Alt. Shift may be added. Escape cancels.')}</p>}
            {operationShortcutError && <p className="shortcut-error" role="alert">{tr('Operation shortcut conflicts or is unavailable.')}</p>}
          </section>}
          {(['convert', 'tools', 'actions'] as const).map((mode) => <SettingsRow key={mode} label={tr(mode === 'convert' ? 'Formats modifier' : mode === 'tools' ? 'Tools modifier' : 'File actions modifier')}><select className="modifier-select" value={preferences.dragModifiers[mode]} aria-label={tr(mode === 'convert' ? 'Formats modifier' : mode === 'tools' ? 'Tools modifier' : 'File actions modifier')} onChange={(event) => updateDragModifier(mode, event.target.value as 'SHIFT' | 'CTRL' | 'ALT')}>{(['SHIFT', 'CTRL', 'ALT'] as const).map((key) => <option key={key} value={key} disabled={key !== preferences.dragModifiers[mode] && Object.entries(preferences.dragModifiers).some(([other, assigned]) => other !== mode && assigned === key)}>{modifierLabel(key)}</option>)}</select></SettingsRow>)}
          {modifierError && <p className="shortcut-error">{tr('Could not update drag modifiers.')}</p>}
          <SettingsRow label={tr('Reset keyboard settings')}><button className="secondary-button" onClick={() => updatePreferences(resetSettingsSection('keyboard'))}>{tr('Reset')}</button></SettingsRow>
        </section>}

        {settingsPage === 'conversion' && <section className="settings-group" aria-labelledby="output-title">
          <h2 id="output-title">{tr('Output settings')}</h2>
          <h3 className="setting-subheading">{tr('Saved conversion profiles')}</h3>
          <div className="dimension-preset-save"><input type="text" maxLength={32} aria-label={tr('Profile name')} placeholder={tr('Profile name')} value={conversionProfileName} onChange={(event) => setConversionProfileName(event.target.value)}/><button className="secondary-button" disabled={!conversionProfileName.trim()} onClick={() => { updatePreferences({ conversionProfiles: saveConversionProfile(preferences.conversionProfiles ?? [], preferences, conversionProfileName) }); setSelectedConversionProfile(conversionProfileName.trim()); setConversionProfileName('') }}><AppIcon name="star"/>{tr('Save current settings')}</button></div>
          <div className="dimension-preset-controls"><select className="modifier-select" aria-label={tr('Saved conversion profiles')} value={selectedConversionProfile} onChange={(event) => setSelectedConversionProfile(event.target.value)}><option value="">{tr('Choose a profile')}</option>{preferences.conversionProfiles?.map((profile) => <option key={profile.name} value={profile.name}>{profile.name}</option>)}</select><button className="secondary-button" type="button" disabled={!selectedConversionProfile} onClick={() => { const profile = preferences.conversionProfiles?.find((item) => item.name === selectedConversionProfile); if (profile) updatePreferences(applyConversionProfile(profile)) }}>{tr('Apply profile')}</button><button className="secondary-button" type="button" disabled={!selectedConversionProfile} onClick={() => { updatePreferences({ conversionProfiles: removeConversionProfile(preferences.conversionProfiles ?? [], selectedConversionProfile) }); setSelectedConversionProfile('') }}>{tr('Remove profile')}</button></div>
          <h3 className="setting-subheading">{tr('Images and PDFs')}</h3>
          <div className="setting-fields">
            <label className="field"><span>{tr('Quality')} · {preferences.quality}%</span><input type="range" min="40" max="100" value={preferences.quality} onChange={(event) => updatePreferences({ quality: Number(event.target.value) })}/></label>
            <label className="field"><span>{tr('PDF page resolution')} · {preferences.pdfDpi} DPI</span><input aria-label={tr('PDF page resolution')} type="range" min="72" max="600" step="1" value={preferences.pdfDpi} onChange={(event) => updatePreferences({ pdfDpi: Number(event.target.value) })}/></label>
            <label className="field"><span>{tr('Max width')}</span><input type="number" min="1" max="32768" value={preferences.width ?? ''} onChange={(event) => { setSelectedDimensionPreset(''); setPresetSaved(false); updatePreferences({ width: event.target.value ? Number(event.target.value) : undefined }) }}/></label>
            <label className="field"><span>{tr('Max height')}</span><input type="number" min="1" max="32768" value={preferences.height ?? ''} onChange={(event) => { setSelectedDimensionPreset(''); setPresetSaved(false); updatePreferences({ height: event.target.value ? Number(event.target.value) : undefined }) }}/></label>
          </div>
          <SettingsRow label={tr('PDF page size')}><select className="modifier-select" aria-label={tr('PDF page size')} value={preferences.pdfPageSize} onChange={(event) => updatePreferences({ pdfPageSize: event.target.value as AppSettings['pdfPageSize'] })}><option value="source">{tr('Original')}</option><option value="a4">A4</option><option value="letter">Letter</option></select></SettingsRow>
          <SettingsRow label={tr('Page orientation')}><select className="modifier-select" aria-label={tr('Page orientation')} value={preferences.pdfPageOrientation} onChange={(event) => updatePreferences({ pdfPageOrientation: event.target.value as AppSettings['pdfPageOrientation'] })}><option value="auto">{tr('Automatic')}</option><option value="portrait">{tr('Portrait')}</option><option value="landscape">{tr('Landscape')}</option></select></SettingsRow>
          <p className="catalog-note">{tr('Page size and orientation apply to image-to-PDF exports.')}</p>
          <SettingsRow label={tr('Dimension preset')}><div className="dimension-preset-controls"><select className="modifier-select" aria-label={tr('Dimension preset')} value={selectedDimensionPreset} onChange={(event) => applyDimensionPreset(event.target.value)}><option value="">{tr('Choose preset')}</option><optgroup label={tr('Purpose profiles')}>{purposeProfiles.map((preset) => <option key={preset.id} value={preset.id}>{tr(preset.name)}</option>)}</optgroup><optgroup label={tr('Built in')}>{sizePresets.map((preset) => <option key={preset.id} value={preset.id}>{tr(preset.name as MessageKey)} · {preset.width} × {preset.height}</option>)}</optgroup>{Boolean(preferences.dimensionPresets?.length) && <optgroup label={tr('Custom presets')}>{preferences.dimensionPresets?.map((preset, index) => <option key={`${preset.name}-${index}`} value={`custom-${index}`}>{preset.name} · {preset.width} × {preset.height}</option>)}</optgroup>}</select>{selectedDimensionPreset.startsWith('custom-') && <button type="button" className="secondary-button dimension-preset-remove" aria-label={tr('Remove preset')} title={tr('Remove preset')} onClick={removeDimensionPreset}><AppIcon name="close"/></button>}</div></SettingsRow>
          <div className="dimension-preset-save"><input type="text" maxLength={32} aria-label={tr('Custom preset name')} placeholder={tr('Custom preset name')} value={presetName} onChange={(event) => { setPresetName(event.target.value); setPresetSaved(false) }}/><button className="secondary-button" disabled={!presetName.trim() || !preferences.width || !preferences.height} onClick={saveDimensionPreset}><AppIcon name="star"/>{tr('Save preset')}</button></div>
          {presetSaved && <p className="catalog-note" role="status">{tr('Preset saved')}</p>}
        </section>}

        {settingsPage === 'files' && <><section className="settings-group"><h2>{tr('Files')}</h2><div className="output-folder-setting"><div><strong>{tr('Save location')}</strong><span title={preferences.outputFolder}>{preferences.outputFolder || tr('Same folder as original')}</span></div><button className="secondary-button" onClick={() => void chooseOutputFolder()}><AppIcon name="folder"/>{tr('Choose folder')}</button>{preferences.outputFolder && <button className="secondary-button" onClick={() => updatePreferences({ outputFolder: undefined })}>{tr('Use source folder')}</button>}</div><label className="field"><span>{tr('ZIP compression')} · {preferences.zipCompressionLevel}/9</span><input type="range" min="1" max="9" value={preferences.zipCompressionLevel} onChange={(event) => updatePreferences({ zipCompressionLevel: Number(event.target.value) })}/></label><p className="catalog-note">{tr('Higher compression can make ZIP archives smaller but takes longer.')}</p></section><section className="settings-group"><h2>{tr('Settings backup')}</h2><p className="catalog-note">{tr('Back up appearance, keyboard, and conversion preferences. Folder paths are excluded.')}</p><div className="settings-backup-actions"><button className="secondary-button" onClick={exportSettings}><AppIcon name="download"/>{tr('Export settings')}</button><button className="secondary-button" onClick={() => settingsImportInput.current?.click()}><AppIcon name="folder"/>{tr('Import settings')}</button><input ref={settingsImportInput} hidden type="file" accept="application/json,.json" onChange={(event) => void importSettings(event)}/></div>{settingsImportError && <p className="shortcut-error" role="alert">{tr('Could not import settings. Choose a valid FlickVert backup.')}</p>}</section></>}
        {settingsPage === 'about' && <section className="settings-group"><h2>FlickVert 0.1.17</h2><p className="catalog-note">{tr('Audio decoder and licenses are listed in the installer notices.')}</p></section>}
      </div>
}
