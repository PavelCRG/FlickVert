# Project structure

FlickVert is a Tauri desktop application. React renders the settings window and quick menu; Rust handles desktop integration and native file operations. The frontend calls Tauri commands and listens for events to coordinate the two windows.

```text
frontend/
  App.tsx              Settings and history window
  main.tsx             Frontend entry point and window selection
  settings.ts          Stored preferences and validation
  i18n.ts              Interface translations
  pdf/                 PDF helpers, editors, and tests
  video-trim/          Video tools, previews, helpers, and tests
  quick-menu/          Action wheel, eligibility rules and geometry
  image-editor/        Image editor and selection geometry
  conversion/          Browser-side image and PDF conversion helpers
src-tauri/
  src/
    main.rs               Binary entry point
    app.rs                Tauri builder, windows, tray, and lifecycle
    state.rs              Shared application state
    workspaces.rs         Temporary-workspace cleanup
    commands/             Frontend-facing commands, grouped by task
    archive.rs            Safe ZIP/TAR/GZIP creation and extraction
    files.rs              Native output-path and file-write helpers
    input.rs              Global shortcut and drag input listener
    operations.rs         Conversion catalog and external-engine execution
    selection.rs          Selected-file tracking
    shell_integration.rs  Windows Explorer integration
  icons/               Icons used by Tauri and desktop installers
  capabilities/        Tauri permissions
public/                Static assets included in the frontend build
scripts/               Build preparation
.github/workflows/     Desktop builds and release packaging
```

The native command modules are split by responsibility: `commands/inspection.rs`, `commands/conversion.rs`, `commands/pdf.rs`, `commands/archives.rs`, `commands/files.rs`, `commands/windows.rs`, and `commands/preferences.rs`. They keep the Tauri command surface organized without duplicating shared application state. PDF and video helpers live beside their editors, with tests next to the code they cover. Run `npm test` for the TypeScript suite, `npm run build` for the frontend, and `cargo test --locked --manifest-path src-tauri/Cargo.toml` for native code. Desktop packaging is defined in `.github/workflows/desktop-build.yml`.
