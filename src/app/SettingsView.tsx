import type { ChangeEvent, RefObject } from 'react'
import { AppIcon } from '../icons/AppIcon'
import type { MessageKey } from '../i18n'
import type { AppSettings } from '../settings'
import { AccentPicker, SegmentedControl, SettingsRow, sizePresets } from '../settings/SettingsControls'
import { modifierLabel } from './keyboard'
import type { Section, SettingsPage } from './AppSidebar'
import type { Engines } from './types'

type SettingsViewProps = {
  settingsPage: SettingsPage; preferences: AppSettings; tr: (key: MessageKey) => string; pickError: boolean
  shortcutError: boolean; modifierError: boolean; recordingShortcut: boolean
  setRecordingShortcut: (recording: boolean) => void; setShortcutError: (error: boolean) => void
  updatePreferences: (patch: Partial<AppSettings>) => void; updateShortcut: (shortcut: string) => Promise<void>
  updateDragModifier: (mode: 'convert' | 'tools' | 'actions', value: 'SHIFT' | 'CTRL' | 'ALT') => void
  setSection: (section: Section) => void; chooseOutputFolder: () => Promise<void>
  engines: Engines; videoCodecs: string[]; audioFormats: string[]; videoScalingAvailable: boolean | null; selectedDimensionPreset: string
  setSelectedDimensionPreset: (preset: string) => void; applyDimensionPreset: (preset: string) => void
  saveDimensionPreset: () => void; removeDimensionPreset: () => void; presetName: string
  setPresetName: (name: string) => void; presetSaved: boolean; setPresetSaved: (saved: boolean) => void
  exportSettings: () => void; importSettings: (event: ChangeEvent<HTMLInputElement>) => void
  settingsImportInput: RefObject<HTMLInputElement | null>; settingsImportError: boolean
}

export function SettingsView(props: SettingsViewProps) {
  const { settingsPage, preferences, tr, pickError, shortcutError, modifierError, recordingShortcut, setRecordingShortcut, setShortcutError, updatePreferences, updateShortcut, updateDragModifier, setSection, chooseOutputFolder, engines, videoCodecs, audioFormats, videoScalingAvailable, selectedDimensionPreset, setSelectedDimensionPreset, applyDimensionPreset, saveDimensionPreset, removeDimensionPreset, presetName, setPresetName, presetSaved, setPresetSaved, exportSettings, importSettings, settingsImportInput, settingsImportError } = props
  return <div className="page settings-page">
        <header className="settings-header">
          <div><p className="welcome-eyebrow">{tr('Settings')}</p><h1>{tr(settingsPage === 'general' ? 'General' : settingsPage === 'appearance' ? 'Appearance' : settingsPage === 'keyboard' ? 'Keyboard' : settingsPage === 'conversion' ? 'Conversion' : settingsPage === 'files' ? 'Files' : 'About')}</h1><p className="subtitle">{tr('Control how FlickVert looks, opens, and saves files.')}</p></div>
        </header>
        {pickError && <p className="shortcut-error">{tr('Could not open files')}</p>}

        {settingsPage === 'general' && <section className="settings-group" aria-labelledby="general-title">
          <h2 id="general-title">{tr('General')}</h2>
          <div className="setting-row"><span>{tr('Quick start')}</span><button className="secondary-button" onClick={() => setSection('guide')}><AppIcon name="guide"/>{tr('Show quick start')}</button></div>
          <p className="catalog-note">{tr('Closing the window keeps FlickVert running in the tray. Use Quit in the tray menu to exit.')}</p>
        </section>}

        {settingsPage === 'appearance' && <section className="settings-group"><h2>{tr('Appearance')}</h2>
          <SettingsRow label={tr('Appearance')}><SegmentedControl label={tr('Appearance')} value={preferences.appearance} options={(['system', 'light', 'dark'] as const).map((value) => ({ value, label: tr(value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark') }))} onChange={(appearance) => updatePreferences({ appearance })}/></SettingsRow>
          <SettingsRow label={tr('Accent color')}><AccentPicker label={tr('Accent color')} value={preferences.accent} customValue={preferences.customAccent} onChange={(accent, customAccent) => updatePreferences(customAccent ? { accent, customAccent } : { accent, customAccent: undefined })} tr={tr}/></SettingsRow>
          <SettingsRow label={tr('Language')}><SegmentedControl label={tr('Language')} value={preferences.language} options={(['en', 'ru', 'zh'] as const).map((value) => ({ value, label: tr(value === 'en' ? 'English' : value === 'ru' ? 'Russian' : 'Chinese') }))} onChange={(language) => updatePreferences({ language })}/></SettingsRow>
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
          <div className="setting-row"><span>{tr('Custom shortcut')}</span><div className="shortcut-recorder"><kbd>{preferences.shortcut.split('+').map((key) => key === 'CTRL' ? 'Ctrl' : key === 'ALT' ? 'Alt' : key === 'SHIFT' ? 'Shift' : key === 'SPACE' ? 'Space' : key).join(' + ')}</kbd><button className="secondary-button" onClick={() => { setShortcutError(false); setRecordingShortcut(true) }}>{tr(recordingShortcut ? 'Press a shortcut...' : 'Change shortcut')}</button></div></div>
          {recordingShortcut && <p className="catalog-note" role="status">{tr('Press a shortcut with Ctrl, Alt or Shift. Escape cancels.')}</p>}
          {shortcutError && <p className="shortcut-error">{tr('Shortcut unavailable. Use the tray menu.')}</p>}
          <p className="catalog-note">{tr('The shortcut opens the quick action wheel.')}</p>
          {(['convert', 'tools', 'actions'] as const).map((mode) => <SettingsRow key={mode} label={tr(mode === 'convert' ? 'Formats modifier' : mode === 'tools' ? 'Tools modifier' : 'File actions modifier')}><select className="modifier-select" value={preferences.dragModifiers[mode]} aria-label={tr(mode === 'convert' ? 'Formats modifier' : mode === 'tools' ? 'Tools modifier' : 'File actions modifier')} onChange={(event) => updateDragModifier(mode, event.target.value as 'SHIFT' | 'CTRL' | 'ALT')}>{(['SHIFT', 'CTRL', 'ALT'] as const).map((key) => <option key={key} value={key} disabled={key !== preferences.dragModifiers[mode] && Object.entries(preferences.dragModifiers).some(([other, assigned]) => other !== mode && assigned === key)}>{modifierLabel(key)}</option>)}</select></SettingsRow>)}
          {modifierError && <p className="shortcut-error">{tr('Could not update drag modifiers.')}</p>}
        </section>}

        {settingsPage === 'conversion' && <section className="settings-group" aria-labelledby="output-title">
          <h2 id="output-title">{tr('Output settings')}</h2>
          <div className="setting-fields">
            <label className="field"><span>{tr('Quality')} · {preferences.quality}%</span><input type="range" min="40" max="100" value={preferences.quality} onChange={(event) => updatePreferences({ quality: Number(event.target.value) })}/></label>
            <label className="field"><span>{tr('Max width')}</span><input type="number" min="1" max="32768" value={preferences.width ?? ''} onChange={(event) => { setSelectedDimensionPreset(''); setPresetSaved(false); updatePreferences({ width: event.target.value ? Number(event.target.value) : undefined }) }}/></label>
            <label className="field"><span>{tr('Max height')}</span><input type="number" min="1" max="32768" value={preferences.height ?? ''} onChange={(event) => { setSelectedDimensionPreset(''); setPresetSaved(false); updatePreferences({ height: event.target.value ? Number(event.target.value) : undefined }) }}/></label>
          </div>
          <SettingsRow label={tr('Video preset')}><select className="modifier-select" aria-label={tr('Video preset')} value={preferences.videoPreset} onChange={(event) => updatePreferences({ videoPreset: event.target.value as AppSettings['videoPreset'] })}><option value="small">{tr('Smaller file')}</option><option value="balanced">{tr('Balanced')}</option><option value="high">{tr('Higher quality')}</option></select></SettingsRow>
          <SettingsRow label={tr('Video codec')}><select className="modifier-select" aria-label={tr('Video codec')} value={videoCodecs.includes(preferences.videoCodec) ? preferences.videoCodec : ''} disabled={!videoCodecs.length} onChange={(event) => updatePreferences({ videoCodec: event.target.value as AppSettings['videoCodec'] })}><option value="" disabled>{tr(videoCodecs.length ? 'Choose supported codec' : 'No supported video codec found')}</option>{videoCodecs.includes('h264') && <option value="h264">H.264</option>}{videoCodecs.includes('hevc') && <option value="hevc">HEVC (H.265)</option>}</select></SettingsRow>
          <SettingsRow label={tr('Maximum video height')}><select className="modifier-select" aria-label={tr('Maximum video height')} value={videoScalingAvailable ? preferences.videoHeight ?? 'original' : 'original'} disabled={videoScalingAvailable !== true} onChange={(event) => updatePreferences({ videoHeight: event.target.value === 'original' ? undefined : Number(event.target.value) as AppSettings['videoHeight'] })}><option value="original">{tr('Original')}</option>{videoScalingAvailable && <><option value="480">480p</option><option value="720">720p</option><option value="1080">1080p</option></>}</select></SettingsRow>
          {videoScalingAvailable === false && <p className="catalog-note" role="status">{tr('Resolution scaling is not supported by the installed FFmpeg.')}</p>}
          <p className="catalog-note">{tr('Only software encoders available in the installed FFmpeg are listed. Smaller output height preserves aspect ratio and never upscales.')}</p>
          <SettingsRow label={tr('Target loudness')}><select className="modifier-select" aria-label={tr('Target loudness')} value={preferences.audioTargetLufs} onChange={(event) => updatePreferences({ audioTargetLufs: Number(event.target.value) })}>{Array.from({ length: 11 }, (_, index) => -24 + index).map((value) => <option key={value} value={value}>{value} LUFS</option>)}</select></SettingsRow>
          <SettingsRow label={tr('Maximum true peak')}><select className="modifier-select" aria-label={tr('Maximum true peak')} value={preferences.audioTruePeakDb} onChange={(event) => updatePreferences({ audioTruePeakDb: Number(event.target.value) })}>{Array.from({ length: 9 }, (_, index) => index - 9).map((value) => <option key={value} value={value}>{value} dBTP</option>)}</select></SettingsRow>
          <p className="catalog-note">{tr('These targets apply to audio normalization. Lower true-peak values leave more headroom.')}</p>
          <SettingsRow label={tr('Audio extraction format')}><select className="modifier-select" aria-label={tr('Audio extraction format')} value={audioFormats.includes(preferences.audioExtractionFormat) ? preferences.audioExtractionFormat : ''} disabled={!audioFormats.length} onChange={(event) => updatePreferences({ audioExtractionFormat: event.target.value as AppSettings['audioExtractionFormat'] })}><option value="" disabled>{tr(audioFormats.length ? 'Choose available format' : 'No supported audio formats')}</option>{audioFormats.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select></SettingsRow>
          <p className="catalog-note">{tr('Audio extraction only lists formats supported by the installed FFmpeg.')}</p>
          <SettingsRow label={tr('Dimension preset')}><div className="dimension-preset-controls"><select className="modifier-select" aria-label={tr('Dimension preset')} value={selectedDimensionPreset} onChange={(event) => applyDimensionPreset(event.target.value)}><option value="">{tr('Choose preset')}</option><optgroup label={tr('Built in')}>{sizePresets.map((preset) => <option key={preset.id} value={preset.id}>{tr(preset.name as MessageKey)} · {preset.width} × {preset.height}</option>)}</optgroup>{Boolean(preferences.dimensionPresets?.length) && <optgroup label={tr('Custom presets')}>{preferences.dimensionPresets?.map((preset, index) => <option key={`${preset.name}-${index}`} value={`custom-${index}`}>{preset.name} · {preset.width} × {preset.height}</option>)}</optgroup>}</select>{selectedDimensionPreset.startsWith('custom-') && <button type="button" className="secondary-button dimension-preset-remove" aria-label={tr('Remove preset')} title={tr('Remove preset')} onClick={removeDimensionPreset}><AppIcon name="close"/></button>}</div></SettingsRow>
          <div className="dimension-preset-save"><input type="text" maxLength={32} aria-label={tr('Custom preset name')} placeholder={tr('Custom preset name')} value={presetName} onChange={(event) => { setPresetName(event.target.value); setPresetSaved(false) }}/><button className="secondary-button" disabled={!presetName.trim() || !preferences.width || !preferences.height} onClick={saveDimensionPreset}><AppIcon name="star"/>{tr('Save preset')}</button></div>
          {presetSaved && <p className="catalog-note" role="status">{tr('Preset saved')}</p>}
          <div className="output-folder-setting"><div><strong>{tr('Save location')}</strong><span title={preferences.outputFolder}>{preferences.outputFolder || tr('Same folder as original')}</span></div>
            <button className="secondary-button" onClick={() => void chooseOutputFolder()}><AppIcon name="folder"/>{tr('Choose folder')}</button>
            {preferences.outputFolder && <button className="secondary-button" onClick={() => updatePreferences({ outputFolder: undefined })}>{tr('Use source folder')}</button>}
          </div>
        </section>}

        {settingsPage === 'conversion' && <section className="settings-group" aria-labelledby="engines-title">
          <h2 id="engines-title">{tr('Conversion engines')}</h2>
          <div className="engine-status">{([['FFmpeg', engines.ffmpeg], ['Pandoc', engines.pandoc], ['ImageMagick', engines.imagemagick], ['LibreOffice', engines.libreoffice], ['Poppler', engines.poppler], [tr('PDF merge (pdfunite)'), engines.pdfunite], [tr('PDF split (Poppler)'), engines.pdfsplit], [tr('PDF page editor (qpdf)'), engines.qpdf]] as const).map(([name, available]) => <div key={name}><span>{name}</span><span className={available ? 'engine-found' : ''}>{tr(available ? 'Detected' : 'Not detected on PATH')}</span></div>)}</div>
        </section>}
        {settingsPage === 'files' && <><section className="settings-group"><h2>{tr('Files')}</h2><div className="output-folder-setting"><div><strong>{tr('Save location')}</strong><span title={preferences.outputFolder}>{preferences.outputFolder || tr('Same folder as original')}</span></div><button className="secondary-button" onClick={() => void chooseOutputFolder()}><AppIcon name="folder"/>{tr('Choose folder')}</button>{preferences.outputFolder && <button className="secondary-button" onClick={() => updatePreferences({ outputFolder: undefined })}>{tr('Use source folder')}</button>}</div><p className="catalog-note">{tr('Your files stay on this device. Processing runs locally.')}</p></section><section className="settings-group"><h2>{tr('Settings backup')}</h2><p className="catalog-note">{tr('Back up appearance, keyboard, and conversion preferences. Folder paths are excluded.')}</p><div className="settings-backup-actions"><button className="secondary-button" onClick={exportSettings}><AppIcon name="download"/>{tr('Export settings')}</button><button className="secondary-button" onClick={() => settingsImportInput.current?.click()}><AppIcon name="folder"/>{tr('Import settings')}</button><input ref={settingsImportInput} hidden type="file" accept="application/json,.json" onChange={(event) => void importSettings(event)}/></div>{settingsImportError && <p className="shortcut-error" role="alert">{tr('Could not import settings. Choose a valid FlickVert backup.')}</p>}</section></>}
        {settingsPage === 'about' && <section className="settings-group"><h2>FlickVert 0.1.3</h2><p className="catalog-note">{tr('Your files stay on this device. Processing runs locally.')}</p></section>}
      </div>
}
