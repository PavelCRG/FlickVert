# FlickVert unified workspace design

## Intent

Make FlickVert feel like one complete desktop file utility: the fast radial workflow stays available from the tray, while the main window explains and exposes the product's current capabilities, settings, and paths.

## Goals

- Add a Tools & Formats page that lists current conversion families, image/media tools, and file actions, including the modifiers and optional engines needed. Its Choose files action uses the existing wheel workflow.
- Preserve file-type-specific filtering and explain when an action is unavailable.
- Add a validated custom accent color that affects both the app and radial wheel while retaining existing presets and saved settings compatibility.
- Keep raw Copy path and add a separate PowerShell-safe quoted path action on Windows.
- Open PowerShell in the selected file's parent folder or selected folder using structured arguments, and retain the direct PowerShell fallback.
- Keep close-to-tray, keyboard/drag behavior, local processing, themes, translations, installer branding, and portable release behavior from the prior product-polish change.
- Use restrained motion, clear button states, system typography, and English/Russian/Chinese localization.

## Non-goals

- Copying source code, branding, or exact screens from Tangerine or Sweetch.
- Adding new conversion engines or claiming capabilities not implemented by the current backend.
- Installing or downloading external engines without an explicit user action.
- Replacing Tauri's packaging pipeline or adding another UI framework.

## Approaches

1. Extend FlickVert in place and share its existing action definitions between the wheel and a discoverability page. Keep Tauri + React + Rust, use the platform's terminal and the current clipboard path, and add only the missing product surface. **Selected:** it brings the two references' useful workflow ideas together without duplicating their app stacks or introducing competing catalogs.
2. Port Sweetch's Windows C# app and imitate Tangerine's Mac-specific UI. This would split the product and abandon the existing cross-platform implementation.
3. Build a separate action engine and desktop home screen. This duplicates the current wheel's operation logic and increases the chance that the catalog advertises actions the wheel cannot run.

## Interaction and UI

- Main navigation contains Home, Tools, Settings, and Quick start. Home is the post-onboarding landing page; Tools is the complete operation catalog.
- Settings has separate General, Appearance, Keyboard, Conversion, Files, and About pages. History is removed from the product UI; previously stored history data is left untouched.
- Tools groups capabilities into conversions, image tools, media tools, and file actions. It labels engine-dependent groups and explains that the wheel still filters by selected file.
- Choosing files opens the existing wheel; Shift selects conversion, Ctrl/Command tools, and Alt/Control file actions. The wheel remains the short path, while the page makes the complete operation set discoverable.
- The custom color is stored as a validated `#RRGGBB` setting. Invalid/old values fall back to the existing preset. Presets clear the custom override.
- The global quick-wheel shortcut can be recorded from the keyboard. Drag mode modifiers (formats, tools, file actions) can each be assigned one of Shift, Ctrl, or Alt; duplicate assignments are disallowed and the native input hook applies the mapping.
- Copy path retains its raw clipboard value. Copy for PowerShell emits a single-quoted literal with embedded single quotes doubled. It is only shown on Windows.
- Open PowerShell here targets a new tab in the last Windows Terminal window, using the selected folder as its starting directory and `powershell.exe` as its command; if Windows Terminal is absent, launch PowerShell directly with that working directory.
- Keep first-run guide, tray close/quit distinction, keyboard support, and `prefers-reduced-motion` behavior.

## Constraints

- Reuse the existing `quick-actions.ts` predicates and action definitions; do not maintain a second list of operations.
- Keep all Rust commands validating the selected path against `DroppedFiles`.
- Keep the raw Copy path command and user settings schema backward-compatible.
- No new dependency unless the current platform API cannot satisfy the requirement.
- Adapt the references' gestures, tray, and release ideas; do not adopt their feature counts as FlickVert promises.

## Implementation scope

Extract the wheel's action definitions into the existing quick-actions module, render them in Tools, add custom accent persistence and Windows shell actions, then update translations and docs. Preserve the previous uncommitted product-polish changes in the same working tree.
