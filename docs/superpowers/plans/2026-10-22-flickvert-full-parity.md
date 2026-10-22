# FlickVert Full Feature Plan

**Goal:** Make FlickVert a reliable local-first Windows/macOS file companion with conversion, file tools, file actions, native-feeling radial menus, and downloadable release builds.

**Architecture:** Keep the existing Tauri 2 + React/TypeScript UI and Rust command layer. Add one operation catalog consumed by both the standard window and the radial wheels; keep expensive conversion engines as managed local tools with clear availability/install state. Use native OS actions only behind small platform-specific Rust functions.

**Research:** `https://tangerineformac.com/`, `https://github.com/krllmrzv/Sweetch`, and the read-only local Sweetch copy at `.research/Sweetch`.

**Current state:** FlickVert has a React settings/conversion window, a Shift-drag conversion wheel, image conversion for PNG/JPEG/WebP, FFmpeg/Pandoc/ImageMagick/LibreOffice PATH detection, and a few media/document/RAW routes. It does not yet contain the full format/tool/action catalog. The Windows executable was built, but Windows only exposed tray/plugin helper windows; the `main` window was not visible. Existing CI uploads temporary build artifacts, but no workflow creates a GitHub Release with durable download links. The current English/Russian/Chinese READMEs exist; verify UTF-8 before rewriting them.

## Reference behavior to carry over

- Three mode wheels while a file is being dragged: Convert (Shift), Tools (Control on Windows / Command on macOS), Actions (Alt); release the modifier and keep the wheel open until the file is dropped or Esc cancels.
- Keyboard path: select files in Explorer/Finder, press the configured shortcut or Enter, move between wheel items with arrows, Enter applies, Esc cancels.
- Conversion categories: images and RAW; audio/video; PDF; documents; slides; spreadsheets; subtitles; archives.
- Tools include image compression/resize/rotate/flip/crop/grayscale/metadata removal and image-to-PDF; audio compression/normalization/trim/join; video compression/resize/mute/trim/rotate/speed/thumbnail; PDF merge/split/rotate/optimize; archive create/extract. Each operation appears only when the selected files and installed engine support it.
- File actions include Copy, Move, Copy Path, reveal/open in file manager, and a floating file shelf. Use the native share/AirDrop action on macOS and the closest native Share action on Windows; do not claim AirDrop works on Windows.
- Settings include theme, language (English/Russian/Chinese), wheel keys, default output folder, engine status and install/manage actions, and persistent job history.
- Local processing, non-destructive outputs, collision-safe filenames, progress, cancellation, and useful errors remain mandatory.

## Global constraints

- Preserve the current Tauri 2 + React + Rust architecture unless the launch investigation demonstrates it is the cause.
- Keep all file processing local; never upload user files.
- Never overwrite an input or existing output; use the existing unique-output and atomic-write helpers.
- Validate archive paths before extraction; reject path traversal and unsafe links.
- Offer only operations whose dependencies are installed and whose input selection is valid.
- Keep Windows and macOS behavior explicit where the operating systems differ.
- Do not copy Sweetch branding or UI assets. Its MIT-licensed source is a behavioral reference; any source code reuse requires its copyright/license notices.
- Preserve reduced-motion and keyboard-accessibility behavior in the wheels.
- Do not promise exact “275 conversions” parity: expose concrete, verified input/output pairs in FlickVert's own catalog.

## Review focus

1. Launch from a fresh Windows account: a visible main window must appear and remain usable after closing/reopening from the tray.
2. Begin a native file drag, tap/release each wheel modifier, hover, drop, cancel, and ensure the source application keeps the file drag alive.
3. Handle mixed selections: only show shared valid operations; never partially overwrite files on an engine error.
4. Extract malformed or hostile archives: reject traversal paths, symlinks escaping the output directory, and duplicate names safely.
5. Package a clean machine: show a clear engine install/setup state and produce the promised Windows/macOS download assets.

## Work sequence

### Task 1: Fix and prove desktop launch; unblock downloads

**Files:** `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `.github/workflows/desktop-build.yml`, new `.github/workflows/release.yml`, `README.md`, `README.ru.md`, `README.zh-CN.md`.

- Capture Tauri startup/window events and inspect the working Sweetch `App`, `WheelWindow`, `TrayIcon`, and `GlobalInput` setup against FlickVert's startup order.
- Isolate the Windows window failure one component at a time: configured main window, tray, global shortcut plugin, and custom low-level hooks. Keep only the smallest change that creates a visible main window on real launch; remove diagnostics after the result is known.
- Make “Show FlickVert” restore, unminimize, and focus the existing window; make first launch show it. A tray-only process is a failure.
- Extend CI so a version tag (for example `v0.2.0`) publishes Windows MSI + portable ZIP, macOS Intel DMG, and Apple Silicon DMG, plus SHA-256 files. Keep PR builds as CI artifacts. Include a short release note with install instructions.
- Verify UTF-8 READMEs and add a prominent Windows download link plus separate macOS architecture links once assets exist.
- **Exit condition:** the app visibly opens on Windows and a pushed release tag produces directly downloadable assets. A local exe alone does not complete this task.

### Task 2: Operation catalog and managed engines

**Files:** `src-tauri/src/operations.rs`, new `src-tauri/src/engine_manager.rs`, `src-tauri/src/main.rs`, `src/types.ts` or current app-local types, `src/App.tsx`, `src/QuickMenu.tsx`, Settings UI and strings.

- Replace category-specific format guesses with a single catalog of input types, output formats, required engine, parameters, and wheel mode.
- Add per-platform tool discovery, version reporting, install/update/remove UI, progress, SHA-256 verification, and safe app-local storage. Bundle Pandoc with Windows ZIP/MSI if size/licensing checks pass; make FFmpeg, LibreOffice, ImageMagick optional, clearly managed dependencies.
- Add generation of output-format options from actual installed engines; keep the main queue and radial wheel on the same catalog.
- **Exit condition:** each advertised operation maps to one engine and one explicit, verified format pair; unavailable engines explain what to install.

### Task 3: Complete conversion categories

**Files:** operation catalog, Rust conversion/operation modules, `src/App.tsx`, `src/QuickMenu.tsx`, localization strings.

- Images: PNG/JPEG/WebP/HEIC/TIFF/AVIF/BMP, SVG input, PDF export, supported RAW camera formats, GIF-to-video/audio; preserve quality/size settings and document first-frame limitations.
- Audio: MP3/M4A/WAV/FLAC/OGG/Opus/AIFF/WMA routes supported by the selected FFmpeg build.
- Video: MP4/MOV/MKV/WebM/AVI/WMV/GIF routes, including MP3 audio extraction where supported.
- Documents/ebooks: DOCX/ODT/RTF/Markdown/HTML/TXT/EPUB and other engine-supported pairs.
- PDF: image export/import; document, slide, spreadsheet, EPUB and text exports where engines support them.
- Slides/spreadsheets: PPT/PPTX/ODP and XLS/XLSX/ODS/CSV/TSV routes, with PDF/image exports where available.
- Subtitles: SRT/VTT/TXT conversions.
- Archives: ZIP/TAR/TAR.GZ create and extract; 7z/RAR input only when a verified optional engine supports it.
- **Exit condition:** every visible format pair succeeds on a representative file and unsupported pairs are not offered.

### Task 4: Tools wheel

**Files:** `src-tauri/src/operations.rs`, new focused modules for image/media/PDF/archive operations, operation parameters dialog, `src/QuickMenu.tsx`, Settings/localization.

- Image: compress, resize presets, rotate, mirror, square crop, grayscale, remove EXIF/GPS, merge selected images into PDF.
- Audio: compress, normalize, trim with time inputs, join compatible selections.
- Video: compress, 720p resize, mute, trim, rotate, 2x speed, thumbnail.
- PDF: merge, split, rotate, optimize, and OCR if a locally licensed OCR engine can be packaged or managed.
- Archives: create/extract with collision-safe destinations and safe path validation.
- Keep each result non-destructive and include actionable per-file failures.
- **Exit condition:** tools wheel is filtered for selected files and all parameters are reviewable before expensive operations.

### Task 5: File actions wheel and quick navigation

**Files:** `src-tauri/src/main.rs`, new small platform-action modules, `src-tauri/src/input.rs`, `src/QuickMenu.tsx`, CSS.

- Add Copy, Move, Copy Path, Reveal/Open in Explorer/Finder, and Float shelf actions for files/folders/mixed selections.
- Use native macOS Share/AirDrop UI where supported; use Windows native Share integration or an honest fallback action.
- Retain the wheel after pressing a modifier; open from mouse drag and keyboard selection; support arrows, Enter, Esc, hover/touchpad position, and proper focus return.
- Add short spring/opacity transitions, reduced-motion fallback, high-contrast/focus states, and avoid animations that delay drop targeting.
- **Exit condition:** all three wheels work from both drag and keyboard routes and remain usable at screen edges and with mixed selections.

### Task 6: Persistent app behavior and system finishing

**Files:** `src/settings.ts`, app history store, Rust platform hooks/tray, `src/App.tsx`, `src/i18n.ts`, platform bundle config.

- Persist settings and completed job history; add default output folder and wheel key configuration with collision feedback.
- Add English/Russian/Simplified Chinese UI strings, system/light/dark appearance, tray menu restore/settings/quit behavior, and platform permission guidance for macOS input monitoring/accessibility.
- Confirm no file is overwritten, settings survive relaunch, multiple monitors/clipped wheel positioning behave, and macOS universal builds use the supported minimum OS.
- **Exit condition:** fresh install → configure → convert/tool/action → close → reopen retains preferences and history, with all displayed strings translated.

### Task 7: Final distribution and user handoff

**Files:** `.github/workflows/release.yml`, release notes, READMEs, app version/config.

- Build Windows MSI + portable ZIP and macOS Intel/Apple Silicon DMGs from clean CI runners; list external engine requirements prominently and ship Pandoc only if license and installer size are acceptable.
- Publish SHA-256 manifests and installation/first-launch instructions. Use notarization/signing only when signing secrets are available; otherwise label macOS builds clearly as unsigned and provide Gatekeeper instructions.
- Push the version tag and verify each asset appears at the GitHub Releases page with working links.
- **Exit condition:** user receives direct download links for available OS builds, not Actions-only temporary artifacts.

## Immediate implementation order

1. Complete Task 1's launch diagnosis and CI release workflow before adding more features.
2. Add Tasks 2–4's core operation catalog and converters/tools.
3. Add Tasks 5–6's file actions, settings, localization, and interaction polish.
4. Publish and verify Task 7.

## Deferred until there is a concrete engine/OS path

- Exact match for every marketing-counted conversion combination.
- Proprietary/format-specific conversions with no safe local engine.
- OCR if an acceptable offline OCR package cannot be distributed.
- AirDrop on Windows (not a Windows capability); use the Windows Share workflow instead.
- Silent auto-updates or telemetry; neither is needed for local conversion.
