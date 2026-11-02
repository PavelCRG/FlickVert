# FlickVert unified workspace implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make FlickVert's existing functions discoverable and customizable, with reliable PowerShell path actions.

**Architecture:** Keep the Tauri + React + Rust stack. Share the wheel's existing action definitions with a new Tools page, keep the native path validation boundary, and reuse the current persisted settings contract with one optional validated color value.

**Tech Stack:** Tauri 2, React 19, TypeScript, Rust, existing CSS and settings storage.

**Spec:** `docs/superpowers/specs/2026-11-02-flickvert-unified-workspace.md`

## Global constraints

- Keep input files safe and results non-overwriting.
- Keep support lists truthful and engine-aware.
- Preserve all prior uncommitted work in this branch.
- Do not push or publish until the user has reviewed the completed change list and explicitly approved.

## Review focus

- Paths containing spaces, Unicode, and apostrophes: PowerShell opens the selected folder and copied literal remains valid.
- Selected files versus selected folders: terminal uses the file's parent or the selected folder.
- Existing settings without a custom color: load exactly as before; malformed custom values are ignored.
- Windows-only PowerShell action: not offered on macOS.
- Wheel mode and catalog: list and mode labels remain backed by the same action definitions and current engine state.

### Task 1: PowerShell and path actions

**Files:** `src-tauri/src/main.rs`, `src-tauri/src/operations.rs`, `src/quick-menu/QuickMenu.tsx`, `src/quick-menu/quick-actions.ts`, `src/i18n.ts`

- [ ] Change Windows Terminal arguments to open a PowerShell tab in the selected starting directory; preserve direct `powershell.exe` fallback.
- [ ] Keep raw Copy path and add a Windows-only command that copies a single-quoted PowerShell literal with doubled internal quotes.
- [ ] Add the action to the wheel, show a platform-correct label, and report copy failures/success in the wheel.
- [ ] Update the Russian/English/Chinese operation labels and user documentation.

### Task 2: Shared catalog and Tools page

**Files:** `src/quick-menu/quick-actions.ts`, `src/quick-menu/QuickMenu.tsx`, `src/App.tsx`, `src/i18n.ts`, `src/style.css`

- [ ] Move existing image, media, archive, and file action definitions into `quick-actions.ts`; keep their runtime eligibility rules unchanged.
- [ ] Add a Tools & Formats page that lists these definitions and the existing conversion families with engine availability from `engine_status`.
- [ ] Add a Choose files action and modifier-key help to that page, and make Tools the post-onboarding landing page.
- [ ] Keep disabled/unavailable operations clearly labelled and do not list unsupported conversions as available.

### Task 3: Custom accent for app and wheel

**Files:** `src/settings.ts`, `src/App.tsx`, `src/quick-menu/QuickMenu.tsx`, `src/i18n.ts`, `src/style.css`

- [ ] Normalize and persist an optional `#RRGGBB` custom accent without changing legacy preset settings.
- [ ] Add an accessible color input beside the existing presets; selecting a preset clears the custom value.
- [ ] Apply the same resolved color to the main UI and radial wheel.

### Task 4: Research, docs, and release review

**Files:** `docs/research/combined-product-analysis.md`, `docs/product-roadmap.ru.md`, `README.md`, `README.ru.md`, `README.zh-CN.md`, `.github/workflows/desktop-build.yml`

- [ ] Keep the comparison and product roadmap aligned with actual shipped operations and the selected platform design.
- [ ] Update terminal, path-copy, catalog, and custom-color instructions in all supported languages and portable package notes.
- [ ] Run `npm run build` and `git diff --check`; report unavailable native/desktop verification accurately.
- [ ] Present the complete change list and wait for explicit approval before any push.
