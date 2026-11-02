# Tangerine + Sweetch: product analysis for FlickVert

Reviewed on 2026-11-02:

- [Tangerine](https://tangerineformac.com/)
- [Sweetch](https://github.com/krllmrzv/Sweetch)
- [Windows Terminal CLI](https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments)

## What each reference contributes

| Product | Strong product ideas | Fit for FlickVert |
| --- | --- | --- |
| Tangerine | One direct drag gesture; separate modifier modes for conversion, tools, and file actions; keep the wheel visible after releasing the modifier; show only operations that apply; keyboard navigation and Escape; local processing | Keep the compact wheel and fast gesture, but show exact supported FlickVert actions and installed-engine state instead of inheriting Tangerine's counts or Mac-only conventions |
| Sweetch | Tray-first Windows workflow; selected-file shortcut; Russian/English and system/light/dark options; installed/portable distribution; clear optional-engine requirements; outputs preserve originals | Keep tray access and portable distribution, reuse a shared platform-aware catalog, and keep Tauri/Rust so Windows and macOS remain one product |

The code and visual identity are not being merged or copied. FlickVert stays a Tauri + React + Rust application; only interaction patterns that solve the same user problem are adapted.

## FlickVert today

- The radial wheel already has separate conversion, tools, and file-action modes, keyboard movement, Escape, source-safe output naming, and modifier-based opening.
- Supported operations are spread across the wheel, README, engine settings, and research notes. There is no central in-app catalog explaining which actions exist and what enables them.
- Accent choices are five fixed presets; the same accent already colors the wheel and main app, so a validated custom accent can naturally control both.
- File actions include Copy path and Open Terminal. Windows Terminal is launched with `wt -d <folder>`, the documented starting-directory option. The final prompt in the supplied screenshot is `PS D:\>`, which indicates the requested directory was reached; the preceding `PS C:\Users\User>` is consistent with a pre-existing terminal prompt. This interpretation is based on the screenshot and needs a live Windows check.
- Copy path copies the raw path. PowerShell users also need a shell-safe quoted literal that can be pasted into commands.
- Closing the main window now hides FlickVert to the tray; the explicit tray Quit command exits the process.

## Unified FlickVert direction

1. Keep the drag wheel and shortcut as the fast path, with operation availability based on input type and installed engines.
2. Add an in-app Tools & Formats page so every existing operation, modifier, and engine requirement is discoverable without a file in hand. Its Choose files button continues into the existing wheel workflow.
3. Add a custom accent input while preserving the five presets; use the chosen accent consistently in the main UI and radial wheel.
4. Keep Copy path unchanged and add Copy for PowerShell, which copies a single-quoted PowerShell literal with embedded quotes escaped.
5. Open an explicit PowerShell tab at the selected file's parent folder (or selected folder) in Windows Terminal, with a direct PowerShell fallback. Use structured arguments, never a composed shell command.
6. Keep the app local, bilingual-plus-Chinese, tray-accessible, and available as installer and portable builds.

## Guardrails

- Do not claim support because a file extension looks familiar; list only operations already implemented by FlickVert.
- Do not copy Sweetch's C# source or its brand, or claim Tangerine's operation counts.
- Do not download engines silently. Show unavailable capabilities and point to their engine requirement.
- Keep existing engine detection, output collision handling, input validation, and source preservation.
- Use system typography and the current quiet surface/accent design. Keep transitions short and honor reduced-motion settings.
