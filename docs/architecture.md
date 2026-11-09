# Project structure

FlickVert is a Tauri desktop application. React renders the settings window and quick menu; Rust handles desktop integration and native file operations. The frontend calls Tauri commands and listens for events to coordinate the two windows.

```text
frontend/
  App.tsx              Settings and history window
  main.tsx             Frontend entry point and window selection
  settings.ts          Stored preferences and validation
  i18n.ts              Interface translations
  quick-menu/          Action wheel, eligibility rules and geometry
  image-editor/        Image editor and selection geometry
  conversion/          Browser-side image and PDF conversion helpers
src-tauri/
  src/                 Native commands, input, selection and file operations
  icons/               Icons used by Tauri and desktop installers
  capabilities/        Tauri permissions
public/                Static assets included in the frontend build
scripts/               Build preparation
.github/workflows/     Desktop builds and release packaging
```

Tests live beside the TypeScript modules they cover; Rust tests live in their modules. Run `npm test` for the TypeScript suite, `npm run build` for the frontend, and `cargo test --locked --manifest-path src-tauri/Cargo.toml` for native code. Desktop packaging is defined in `.github/workflows/desktop-build.yml`.
