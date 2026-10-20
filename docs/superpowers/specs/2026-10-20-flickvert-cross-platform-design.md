# FlickVert cross-platform file utility — design

## Intent

Turn FlickVert from a basic image converter into a polished local file utility for Windows and macOS. Use Sweetch as a functional reference for the quick radial workflow and breadth of file operations, while keeping FlickVert's own name, visual identity, and implementation.

Reference: https://github.com/krllmrzv/Sweetch

## Current state

- The app is Tauri 2, React, TypeScript, and Rust. It currently converts PNG, JPEG, WebP, GIF (first frame), and BMP input to PNG, JPEG, or WebP in the webview.
- It has a regular window with queue, settings, session history, and light/dark themes.
- There is no tray icon, global shortcut, radial menu, native file-operation engine, or macOS-specific work yet.

## Goals

- Support Windows 10/11 and macOS in one maintainable codebase.
- Keep file processing on-device; never replace source files. Show the output destination and any required external tools before an operation.
- Give users a fast entry point: a configurable global shortcut opens a compact action wheel; users can also open the main window and drop or select files.
- Keep FlickVert's compact FV identity and make the interface feel system-native: follow Windows and macOS typography, controls, spacing, title bars, menus, and light/dark appearance instead of adding a separate decorative theme.
- Provide Russian and English UI, system/light/dark theme choice, persistent preferences, and an operation history.

## User workflow

1. The user opens FlickVert from the Windows notification area or macOS menu bar, or invokes a configurable system shortcut.
2. A compact radial action picker appears near the pointer. The user drops files into it or selects files in the main window.
3. FlickVert detects file types and offers only valid actions. The first implementation can keep simple modifier-key selection (Shift: convert, Ctrl/Command: tools, Alt/Option: actions) where it works reliably, but every action must also be reachable by click and keyboard.
4. The user chooses an output format/action, destination, and any relevant quality options. FlickVert processes a copy, reports per-file success/failure, and can reveal the output.
5. Advanced or unavailable operations identify any required tool (for example FFmpeg or LibreOffice) and let the user install it from settings; no tool is downloaded or executed silently.

## Functional scope

### Core desktop workflow

- Tray/menu-bar presence with Open, Quick actions, Preferences, and Quit.
- Configurable global shortcut with conflict/error feedback.
- Radial action picker, opened near the pointer and dismissible with Escape or click outside.
- Main window with file drop/select, operation queue, progress, clear errors, output location control, history, and preferences.
- Multiple files and mixed formats; validate each file and operation before running.
- Never overwrite input; default to a dedicated `FlickVert` output folder, with user-selectable output location.
- If an output name already exists, automatically choose the next available name (`name (2).ext`); never overwrite existing output or source files.

### Operations, delivered in stages

- Stage 1: image conversion, including common raster formats; JPEG/PNG/WebP output, quality and resize; make animated-image behavior explicit and avoid silently discarding animation.
- Stage 2: audio and video conversion using FFmpeg; common document/text conversions using Pandoc; PDF/Office operations that require LibreOffice.
- Stage 3: common RAW camera formats and archive/subtitle operations where an installed engine supports them.
- Each file type has a small, explicit action catalog. Do not promise an operation merely because a file can be selected.

### Settings

- Language: system, Russian, English.
- Appearance: system, light, dark.
- Global shortcut and radial-menu behavior.
- Tool status/install/remove controls for optional engines.
- Output folder and file naming behavior.

## Platform and architecture calls

- Keep Tauri 2 + React/TypeScript + Rust; do not port the backend to C#. .NET is Sweetch's implementation choice, but it is Windows-oriented and would add a second app stack for macOS. Rust/Tauri already targets both requested platforms.
- Do not require Swift to build or run FlickVert; implement shared UI and native integrations with TypeScript and Rust through Tauri.
- Keep UI and operation catalog shared. Use Tauri/Rust commands for file paths, long-running processing, progress, output, and native OS integration. Keep platform-specific tray, shortcut, packaging, and permission behavior behind small platform-specific adapters.
- Use native platform shell conventions where they differ; do not force identical window chrome on both systems.
- Keep optional processing tools isolated from the app process, download only on user action, verify official release checksums when available, and report versions/status.
- Treat macOS permission requirements and unavailable hooks as explicit UI states; provide the in-app drop/picker path without requiring accessibility permissions.

## Out of scope

- Copying Sweetch branding, source code, or exact visual design.
- Accounts, cloud upload, telemetry, auto-update, or server-side conversion.
- Replacing the app with a web-only product.
- Claiming complete format coverage before each operation is implemented and verified on both OS families.

## Builder decisions

- The action wheel is a fast launcher; all capabilities remain available from the main window for accessibility and discoverability.
- Use platform-appropriate shortcut defaults and allow the user to change them; do not hard-code a shortcut that may conflict on one OS.
- Tool downloads are opt-in and use upstream distributions rather than bundling large third-party binaries into the app initially. Detect system-installed engines when possible, but only install/remove copies managed by FlickVert.
- Deliver a working vertical slice first: native launch/close-to-tray, shortcut, radial picker, image conversion and resize, settings, and Windows/macOS build configuration. Add format engines in the stages above.
- First target Windows 10/11 x64 and macOS 13+ on Apple Silicon and Intel. Produce Windows installer and macOS app/disk image builds; signing/notarization can be added when release credentials are available.

## Acceptance criteria

- A user can launch, open the action wheel, select/drop image files, convert them locally, see progress and errors, and find outputs without overwriting inputs.
- Main-window, tray/menu-bar, shortcut, and keyboard paths work without relying only on drag gestures.
- Russian/English and system/light/dark preferences persist after restart.
- Windows and macOS builds have platform-appropriate app behavior; unavailable permissions/tools are explained in the UI.
- The README lists tested operating systems, supported operations, optional engines, and accurate build/run instructions.
