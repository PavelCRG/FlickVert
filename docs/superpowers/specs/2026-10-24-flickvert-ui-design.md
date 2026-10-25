# FlickVert UI Design

## Intent

Make FlickVert feel like a small, dependable Windows/macOS utility. The main window is for preferences and history; file work stays in Explorer/Finder and the compact radial menu.

## Goals

- Use quiet system surfaces, readable typography, one blue accent, and predictable 4/8/12/16/24 px spacing.
- Keep Settings and History easy to reach; group appearance, language, shortcut, output, and engine status without a promotional home screen.
- Make the radial menu appear quickly beside the pointer, show the hovered sector immediately, and run that sector on drop without a confirmation dialog.
- Keep keyboard access, focus visibility, disabled states, localization in English/Russian/Chinese, and reduced-motion support.
- Save conversions beside the source unless the user chooses another folder.

## Non-goals

- Do not migrate the project to Tailwind or add a full UI framework solely for basic controls.
- Do not change conversion behavior, file safety rules, tray behavior, or saved preference formats as part of this visual pass.
- Do not add decorative logos, a marketing dashboard, or repeated confirmation dialogs.

## Visual direction

- Palette: window `#F5F6F8`, surface `#FFFFFF`, text `#20242C`, muted text `#777F8D`, border `#E6E8EC`, accent `#285FE8`; dark mode follows the existing token set.
- Typography: system UI (`Segoe UI` on Windows, system font on macOS), 12–14 px controls/body, 24–26 px page title.
- Main window: compact native-feeling sidebar with Settings/History; settings content aligned left in grouped form rows; no hero or large logo.
- Radial menu: 320 px transparent window, centered 304 px circle, neutral sectors, blue hover/active sector, file/target in the center, 160 ms scale/fade entrance; no toolbar or glass panel.

## Interaction

- Hover changes only the highlighted target and center label; releasing the dragged file over an enabled sector performs the action immediately.
- Releasing in the center, outside the ring, or on a disabled sector performs no action.
- Escape closes the wheel. Keyboard arrows and Enter remain available when the wheel is focused. Reduced-motion settings remove entrance animation.
- Errors stay in the wheel's status text; output naming and source files remain protected by existing conversion code.

## Implementation constraints

- Keep React 19, TypeScript, Tauri 2, and the existing CSS setup.
- Adapt interaction and hierarchy patterns from Untitled UI; do not copy its Tailwind/React Aria implementation into this project.
- Verify with the existing Node test suite, frontend build, Rust check, and a visible Windows launch. Manually exercise radial hover/drop when the desktop environment permits.
