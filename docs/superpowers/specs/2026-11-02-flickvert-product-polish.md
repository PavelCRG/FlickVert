# FlickVert product polish

## Intent

Make FlickVert dependable as a background utility and easier to learn, install, and use. File work stays local and the radial menu remains the fastest workflow.

## Goals

- Closing the main window hides it to the tray; the tray's Quit command fully exits the process. Global shortcuts and drag gestures remain available while hidden.
- Route only left-button drags into the gesture state machine. Ignore modifier modes that have no usable action for the current selection.
- Explain the Shift/Ctrl/Alt drag workflow, the configurable shortcut, local processing, and optional engines during first launch.
- Give the Windows NSIS installer a small FlickVert-branded header and welcome/finish artwork using Tauri's existing installer. Keep MSI, portable ZIP, and macOS DMG.
- Use brief, restrained transitions for menus and onboarding, with reduced-motion support and keyboard access.
- Keep operation lists derived from actual input type and installed engines. Never advertise a format or tool that is not implemented.

## Non-goals

- Recreate Tangerine's advertised catalog or copy either reference product's branding/code.
- Add new format engines, download tools silently, or change conversion/output safety rules in this pass.
- Replace the existing Tauri installer or add a new UI/animation dependency.

## Approaches

1. Extend the existing Tauri/React/Rust product in place, reuse the tray, action catalogs, settings, translations, and native bundle targets, and add only missing lifecycle/learning/branding pieces. This is the selected approach because it fixes the reported problem with the least risk and keeps Windows/macOS on one app stack.
2. Replace the current distribution and interaction systems with a custom installer and a much larger conversion catalog. This adds substantial platform-specific work and cannot be completed safely without implementing and validating every new engine.

## Interaction and visual direction

- The main window close button and OS close request have identical hide-to-tray behavior. Only the explicit tray Quit command terminates FlickVert.
- Shift opens conversion, Ctrl opens tools, and Alt opens file actions during a left-button drag. Unsupported modes are ignored for a known selection; the menu can still be opened before a selection arrives.
- First launch shows a compact welcome with the three gestures, shortcut, local-processing note, and a way to continue to the existing settings/actions. The choice is stored locally and can be reached again from Settings.
- Use the current FlickVert orange mark, existing accent/theme settings, system typography, and quiet surfaces. Keep animation under 200 ms and remove it under `prefers-reduced-motion`.
- NSIS branding uses bitmap assets configured through Tauri. The current-user install mode and all existing package formats remain.

## Constraints and decisions

- Keep Tauri 2, React, Rust, existing dependencies, translations, and file operation validation.
- Preserve keyboard navigation and current preferences. Do not add network behavior or background engine downloads.
- Update the portable archive's instructions so they describe the new close-to-tray behavior accurately.

## Builder scope

Implement the lifecycle/input fix first, then selection-aware mode switching, onboarding and repeatable help, motion/accessibility polish, and Windows installer branding. Keep each step small and ensure packaging paths reference checked-in assets.
