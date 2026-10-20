# FlickVert Cross-Platform File Utility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build FlickVert into a polished, local-first file utility for Windows 10/11 and macOS, beginning with a radial quick menu and image conversion, then adding common media, document, RAW, and archive operations.

**Architecture:** Keep one React/TypeScript interface and Tauri 2/Rust desktop host. Use Tauri plugins and Rust commands for OS integration, paths, queue execution, and optional external engines; use browser image APIs for the initial common image conversion path. Keep all source and output files local.

**Tech Stack:** Tauri 2, Rust 1.90+, React 19, TypeScript, Vite, Tauri dialog/fs/store/global-shortcut plugins, Rust image/file crates and native standard library process APIs; Node 24 built-in test runner (no frontend test framework).

**Spec:** `docs/superpowers/specs/2026-10-20-flickvert-cross-platform-design.md`

## Global Constraints

- Support Windows 10/11 x64 and macOS 13+ on Apple Silicon and Intel.
- Do not require or add Swift; shared UI and native behavior use TypeScript and Rust through Tauri.
- Keep all file processing on-device; never overwrite source files or existing outputs.
- On output collision, select the next available name (`name (2).ext`).
- Do not download, install, or execute optional conversion tools without an explicit user action.
- Keep FlickVert branding and create an original, compact interface that follows Windows/macOS window conventions.
- Use system typography, native controls, spacing, title bars, and system light/dark appearance; avoid a separate ornamental visual theme.
- Do not claim an operation is supported unless its real input/output path exists and is verified.

## Review Focus

- Unsupported or malformed images: report the file as failed, preserve it, and keep the rest of a batch running.
- Animated images: disclose first-frame behavior before conversion; never imply animation was preserved.
- Large images and failed writes: release bitmap resources and remove incomplete temporary outputs.
- Existing filenames and case-insensitive Windows paths: select a unique output without replacing a prior result.
- Shortcut conflicts, hidden windows, and multiple monitors: keep tray/window access available, report registration failures, and clamp the quick menu inside the active display.

## File Map

- `src-tauri/src/main.rs` — register plugins, tray, shortcut, commands, and hidden quick window.
- `src-tauri/src/lib.rs` — expose Rust modules and Tauri builder for unit tests.
- `src-tauri/src/files.rs` — output directory, unique output naming, temporary write, and safe completion.
- `src-tauri/capabilities/default.json` — narrow window/plugin permissions.
- `src-tauri/tauri.conf.json` — main and hidden quick windows, bundle targets, and CSP.
- `src/App.tsx`, `src/style.css` — main window queue, settings, history, and shared FlickVert design.
- `src/QuickMenu.tsx`, `src/quick-menu.css` — keyboard accessible radial action picker.
- `src/conversion/images.ts` — image decode, resize, encode, and explicit format limits.
- `src/settings.ts`, `src/i18n.ts` — persisted preferences and English/Russian strings.
- `src/settings.test.ts`, `src/quickWindow.test.ts`, `src/conversion/images.test.ts` — pure settings, display-clamping, and image-sizing tests using `node:test`.
- `src-tauri/src/engines.rs`, `src-tauri/src/operations.rs` — later optional engine discovery/execution and format action registry.
- `src/quickWindow.ts` — show/position the quick window from a global shortcut or tray action.
- `src/nativeFiles.ts` — map selected/dropped native paths to one-file-at-a-time image inputs.
- `.github/workflows/desktop-build.yml` — unsigned build checks for Windows and macOS.
- `README.md` — actual support matrix, setup, optional tools, and build instructions.

### Task 1: Safe local file output and image operation primitives

**Files:** Create `src-tauri/src/files.rs`, `src/conversion/images.ts`, `src/conversion/images.test.ts`; modify `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, `package.json`.

**Interfaces:**

- `unique_output_path(directory: &Path, file_name: &str) -> Result<PathBuf, FileError>` returns a path not already present, starting at the original name then `(2)`, `(3)`, and so on.
- `write_output(directory: &Path, file_name: &str, bytes: &[u8]) -> Result<PathBuf, FileError>` writes to a temporary file and atomically completes at a unique path; it never truncates an existing path.
- `convertImage(file: File, options: ImageOptions) -> Promise<Blob>` supports PNG, JPEG, and WebP output, quality 40–100 for JPEG/WebP, and optional fit-within width/height resize while preserving aspect ratio.

- [ ] **Step 1: Add Rust tests for unique naming and atomic output.** Cover first name, existing name advancing to `(2)`, a second collision advancing again, Windows case-insensitive collision, and cleanup/absence of a partial target on write failure.
- [ ] **Step 2: Run `cargo test` in `src-tauri` and verify the new tests fail because the functions do not exist.**
- [ ] **Step 3: Implement `files.rs` and expose the minimal Tauri commands needed to resolve the default `Downloads/FlickVert` output directory and save bytes safely.** Use exclusive file creation; do not build paths from unchecked parent traversal.
- [ ] **Step 4: Add `node:test` cases for `normalizeImageOptions` and `fitWithin` (invalid dimensions, exact bounds, portrait, landscape, and no upscale), then implement `convertImage` with `createImageBitmap`, canvas, and `toBlob`.** Fill JPEG transparency white; close bitmaps in `finally`; report first-frame-only for animated GIF inputs.
- [ ] **Step 5: Run `cargo test`, `node --experimental-strip-types --test src/conversion/images.test.ts`, and `npm run build`.** Expected: Rust naming/write and Node image tests pass and the frontend builds.
- [ ] **Step 6: Commit as `feat: add safe local image conversion`.**

### Task 2: Main-window file intake, queue, preferences, and localization

**Files:** Modify `package.json`, `src/App.tsx`, `src/style.css`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`; create `src/settings.ts`, `src/i18n.ts`.

**Interfaces:**

- `loadSettings() -> Promise<AppSettings>` loads stored settings and safely defaults invalid/missing values.
- `saveSettings(settings: AppSettings) -> Promise<void>` persists language, appearance, shortcut, output directory, quality, and resize defaults.
- `t(language: Language, key: MessageKey) -> string` resolves every visible label/error in English or Russian.
- Queue rows carry an input path, display name, detected type, selected operation, and per-file status; they do not keep all file bytes in React state. `loadImageFile(path: string) -> Promise<File>` reads just one selected file via Tauri fs before calling `convertImage`.

- [ ] **Step 1: Add `node:test` cases in `src/settings.test.ts` for settings validation/defaults.** Invalid shortcut/quality/resize values must resolve to defaults and not break startup.
- [ ] **Step 2: Run `node --experimental-strip-types --test src/settings.test.ts` and verify the new tests fail before the settings implementation.**
- [ ] **Step 3: Add the `test` npm script using Node 24's built-in test runner and add Tauri dialog, filesystem, and store plugins with only the required capabilities; persist preferences in app data and migrate the existing `flickvert-theme` localStorage value once.**
- [ ] **Step 4: Replace browser-only file picking with native file selection and Tauri file-drop paths; read only the current file when processing.** Preserve per-file errors and continue a batch after one file fails.
- [ ] **Step 5: Add Russian/English strings and system/light/dark appearance; reshape the current screen into a compact converter, history, and settings layout using system-native typography/controls/spacing and platform title-bar conventions.**
- [ ] **Step 6: Run focused settings tests and `npm run build`; commit as `feat: add localized desktop conversion workspace`.**

### Task 3: Windows tray, macOS menu bar, shortcut, and radial quick window

**Files:** Modify `package.json`, `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src/App.tsx`; create `src/QuickMenu.tsx`, `src/quick-menu.css`.

**Interfaces:**

- One TypeScript function `showQuickWindow(): Promise<void>` positions the predeclared `quick` window near the pointer, clamps it to the monitor work area, then shows and focuses it.
- `clampWindowPosition(pointer: Point, window: Size, workArea: Rect) -> Point` keeps the entire quick window inside its active display.
- The quick window emits selected `{ actionId, inputPaths }`; the main window accepts that event and adds the paths to its queue.
- The configurable system shortcut opens the quick menu; default is `Ctrl+Alt+Space` on Windows and `Control+Option+Space` on macOS.
- Tray/menu-bar actions: Show FlickVert, Quick actions, Preferences, Quit. Closing the main window hides it; Quit exits.

- [ ] **Step 1: Add `node:test` cases in `src/quickWindow.test.ts` for the pure screen-rectangle clamping calculation, including pointer positions on each edge.**
- [ ] **Step 2: Run `node --experimental-strip-types --test src/quickWindow.test.ts` and confirm the new tests fail before implementing the helper.**
- [ ] **Step 3: Add and register Tauri global-shortcut plugin; configure a transparent, frameless, initially hidden `quick` webview window; create a native tray icon/menu.** Register the saved shortcut from the running frontend so it remains active while the main window is hidden. Keep registration failure visible in settings and retain tray access.
- [ ] **Step 4: Implement the radial menu with click and keyboard navigation, Escape dismissal, drop/select file entry, and operation choices derived from detected file types.** Support modifier selection only where reliable; do not make it the only route.
- [ ] **Step 5: Run the clamping test, `npm run build`, and `cargo check`; manually verify main-window/tray/shortcut/radial flow on Windows.** Commit as `feat: add tray shortcut and radial quick menu`.

### Task 4: Optional media/document engines and action registry

**Files:** Create `src-tauri/src/engines.rs`, `src-tauri/src/operations.rs`, `src-tauri/src/engine_process.rs`; modify `src/QuickMenu.tsx`, `src/App.tsx`, `src/settings.ts`, `src/i18n.ts`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`.

**Interfaces:**

- `Operation` contains stable id, accepted input extensions/MIME types, output choices, required engine (optional), and whether it needs settings.
- `list_operations(input_path: &Path, available_engines: &EngineStatus) -> Vec<Operation>` returns only operations that can run.
- `detect_engines() -> EngineStatus` checks only configured app-managed paths and known executable names on PATH; it never invokes a shell.
- `run_operation(operation_id: &str, input: &Path, output: &Path, options: &OperationOptions) -> Result<(), OperationError>` invokes a validated executable with separated arguments, never shell interpolation, and writes to a unique output.

- [ ] **Step 1: Add unit tests for operation filtering and executable argument construction.** Include unsupported input, missing engine, paths containing spaces, and a failed child process.
- [ ] **Step 2: Run the focused Rust tests and verify they fail before implementation.**
- [ ] **Step 3: Implement the registry and safe engine detection.** Start with ZIP create/extract using Rust crates; FFmpeg audio/video conversion; Pandoc conversion among DOCX, Markdown, HTML, EPUB, RTF, and TXT; LibreOffice Office/PDF conversion only when installed; then common RAW (CR2/CR3, NEF, ARW, RAF, DNG, ORF, RW2) and SRT/VTT subtitle actions when an engine supports them. Show install/help links in settings and require a direct user action before any download or external installer. Never remove system-installed tools.
- [ ] **Step 4: Add progress/error events and per-file cancellation to the queue.** Do not mark success until the output exists and can be opened.
- [ ] **Step 5: Run operation tests and `cargo test`; manually verify one success and one failure for each engine available on the current OS.** Commit as `feat: add optional media and document operations`.

### Task 5: Release configuration, CI, and support documentation

**Files:** Create `.github/workflows/desktop-build.yml`; modify `README.md`, `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.

- [ ] **Step 1: Add a Windows and macOS CI matrix using stable Rust (1.90+) and Node 24; run `npm run test`, `npm run build`, `cargo test`, and build Tauri unsigned packages for Windows x64 and macOS ARM64/x64.** Store no signing secrets and do not publish releases.
- [ ] **Step 2: Run `npm run test`, `npm run build`, `cargo test`, and `npm run tauri build` locally where available.** Expected: local platform artifacts build; CI performs the other platform builds.
- [ ] **Step 3: Rewrite README for real supported input/output operations, optional engine setup, privacy, shortcuts, OS versions, build commands, and the unsigned macOS Gatekeeper note.**
- [ ] **Step 4: Commit as `build: add Windows and macOS CI packages`.**

## Completion Checks

- `npm run test`, `npm run build`, and `cargo test` pass.
- `cargo test` passes for output collision/safety, image behavior, shortcut positioning, engine discovery, and argument construction.
- `npm run tauri build` succeeds for Windows locally; GitHub Actions builds Windows and macOS unsigned packages.
- Manual Windows check covers startup, hide/restore from tray, global shortcut, radial menu, batch image conversion/resize, output collision, Russian/English, dark/light/system theme, and one unavailable engine.
- macOS user verification still needs a Mac; CI compilation does not prove menu-bar, Finder drop, or Gatekeeper behavior at runtime.
