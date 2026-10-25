# FlickVert UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FlickVert's settings window and radial file menu coherent, compact, animated, and predictable on Windows/macOS.

**Architecture:** Keep the Tauri and React application structure. Move radial hit-testing into the existing pure geometry module so tests and UI use the same coordinates; keep UI controls as small React components styled with the existing CSS token system.

**Tech Stack:** React 19, TypeScript, Tauri 2, CSS, Node's built-in test runner, Rust.

**Spec:** `docs/superpowers/specs/2026-10-24-flickvert-ui-design.md`

## Global Constraints

- Preserve existing file conversion, output naming, tray, and preference behavior.
- Keep the quick window at 320×320 logical px and circle at 304×304 px.
- Run actions on release over an enabled sector; hover only previews selection.
- Preserve keyboard navigation, accessibility labels, and reduced-motion support.
- Do not add dependencies or delete user-owned untracked folders.

## Review Focus

- Pointer positions at different Windows display scales: pure geometry test at 1× and 2×.
- Pointer in the hub or outside the ring: selector returns no action.
- Disabled tool selected during drag: cannot be highlighted or executed.
- Short window height/dark theme/long localized strings: layout remains readable and scrollable.
- Reduced-motion preference: wheel entrance animation is disabled.

---

### Task 1: Radial selection geometry

**Files:**
- Modify: `src/radial-wheel.ts`
- Modify: `src/radial-wheel.test.ts`
- Modify: `src/QuickMenu.tsx`

**Interfaces:** `wheelSectorAt(point, size, count)` returns a sector index or `-1`; both hover and drop handling call this helper.

- [x] Add tests for top/right sectors, center/outside rejection, invalid count, and 2× coordinates.
- [x] Run `npm test` and confirm the new tests fail because `wheelSectorAt` is not implemented.
- [x] Implement the shared selector using the existing 0.215/0.47 radius ratios and top-origin clockwise sector order.
- [x] Replace duplicated local hit-testing in `QuickMenu.tsx`; ignore disabled hover targets and reject disabled drops.
- [x] Run `npm test` and `npm run build`.

### Task 2: Settings components and hierarchy

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/i18n.ts`
- Modify: `src/style.css`

**Interfaces:** Keep the current Settings/History sections and `AppSettings` persistence contract. Use local React controls for segmented choices and labeled setting rows.

- [x] Group theme/language under General; show keyboard shortcut, output controls, save destination, and engine status as clearly labeled settings rows.
- [x] Keep the page compact, scrollable at minimum window size, and legible in light/dark themes.
- [x] Add/verify translations for any new visible labels in English, Russian, and Chinese.
- [x] Run `npm run build` and `npm test`.

### Task 3: Radial visual states and animation

**Files:**
- Modify: `src/quick-menu.css`
- Modify: `src/QuickMenu.tsx`
- Modify: `src-tauri/src/main.rs` only if logical window size needs adjustment.

**Interfaces:** Keep existing wheel choices, action callbacks, drag mode events, keyboard bindings, and 320×320 logical window.

- [x] Use a restrained 160 ms center-origin scale/fade entrance and fast active-sector color/stroke transitions.
- [x] Keep the active label and center preview synchronized with the sector under the pointer.
- [x] Honor `prefers-reduced-motion`; do not add confirmation UI.
- [x] Run `npm run build`, `npm test`, and `cargo check --manifest-path src-tauri/Cargo.toml --no-default-features`.
- [ ] Launch the Windows app and verify the main settings window is visible; manually check wheel hover/drop if Explorer drag events are available. The build starts the tray process, but this session has no interactive desktop/browser surface, so window visibility and live pointer feedback cannot be confirmed here.
