# FlickVert product polish plan

## 1. Keep the app available from the tray

- Change main-window close requests to prevent closing and hide the window.
- Keep the tray Quit item as the only full exit path.
- Correct portable package instructions and tray/close guidance in the UI.

## 2. Make drag modes and mouse input file-aware

- Stop treating right mouse button events as left-button drag events.
- Gate modifier-wheel switches against existing formats/actions for a known selection.
- Keep existing per-action disabled-state validation as the final execution guard.

## 3. Teach the core workflow

- Add a first-run welcome explaining Shift/Ctrl/Alt, the configurable shortcut, local processing, and optional engines.
- Persist dismissal and provide a Settings entry to reopen the guide.
- Add English, Russian, and Chinese strings for all new visible text.

## 4. Polish the interface and installer

- Add restrained entrance/transitions and reduced-motion overrides to the welcome and radial menu.
- Generate checked-in FlickVert NSIS header/sidebar bitmaps and configure Tauri to use them.
- Preserve MSI, NSIS, portable ZIP, and macOS DMG release outputs.

## Scope check

No new conversion backend, dependency, unsupported format claim, update behavior, or output rule is added.
