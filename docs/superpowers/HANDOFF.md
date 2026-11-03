# FlickVert roadmap handoff

## Current state

- The roadmap is active. Finish the remaining items before creating the next GitHub Release; do not reset, clean, or force-push.
- Source of truth: `docs/superpowers/plans/2026-11-03-flickvert-100-improvements.md`.
- Current `main` and `origin/main` are at `bf247b359095a3d567c68a7979beed06c088caf6` (`fix: retry mounted macOS DMG safely`), authored as `PavelCRG <pavelslepcov864@gmail.com>`. The latest verified GitHub Release is `v0.1.3`; the next release should be `v0.1.4` after roadmap verification.
- Preserve the existing untracked user artifacts. `.signing/` is ignored; never stage or reveal signing material. GitHub CLI reports an invalid keyring token, although Git Credential Manager can push.

## Plan status audit

In the current plan, all items are checked except 90, 92, 94, and 100. Items 1–19 were audited and verified against the current code; do not reopen them without new evidence. Continue with item 90.

## Current verification (2026-11-03)

- At `bf247b3`, `npm ci` completed from the lockfile, `npm test` passed 100/100, `npm run build` passed, and `cargo test --locked` passed 81/81 on Windows. After the shared-WebView-profile change below, `npm test` again passed 100/100, `npm run build` passed, `cargo test --locked` passed 81/81, and `cargo build --locked` passed. The ignored ZIP memory sample also passed. A native Windows installer was not rebuilt in this session.
- Windows installer test passed using the published `v0.1.3` installer followed by the current installer, then uninstall. It verified one uninstall registration and preservation of user-data and selected-file sentinels. Both installers identify as `0.1.3`, so verify a true `v0.1.3` → `v0.1.4` transition before closing item 92.
- GitHub Actions for commit `4a929b7`: Windows and Apple Silicon passed; Intel macOS failed during DMG packaging. The full log shows Tauri mounts `bundle/macos/rw.<pid>.FlickVert_<version>_x64.dmg`; the previous retry incorrectly searched `bundle/dmg` for the final image, which did not exist yet.
- Commit `bf247b3` contains the version/architecture-specific DMG retry fix under `bundle/macos`. The DMG mock test passed for Intel and Apple Silicon before the commit; GitHub Actions results for `bf247b3` were not checked in this session.
- Item 90 is still open. A historical headless production-preview sample measured Home ~950 ms, Tools ~29 ms, and `qpdf` search ~6.4 ms; its procedure is not reproducible from the repo and it does not cover the native wheel. The old Windows instance with separate `main` and `quick` WebView2 profiles measured ~732 MB summed working set and ~372 MB private memory across the host and 12 WebView2 processes. The code now points both windows at the existing `webview-main` profile, preserving its localStorage and leaving `webview-quick` untouched. An isolated-profile smoke run of the new build measured ~438 MB working set and ~237 MB private memory across the host and 7 WebView2 processes (one sample on this machine). A fresh-profile launch reached a visible main window in 2.75 s (one sample). The ignored `creates_zip_for_256_mib_input` sample compressed 256 MiB in 3.36 s; the Rust test process peaked at 5.6 MB working set and 1.4 MB private memory, excluding the resident app/WebView2. The earlier launch readings (1.79 s, then 0.73/0.78 s) were contaminated by an already-running installed instance. These are single-machine samples, not p95 budgets; repeat the main/wheel/search timings and measure full app memory during a large-file operation before closing item 90.
- Item 94 is still open. Only `TAURI_SIGNING_PRIVATE_KEY` and its password exist in GitHub Actions Secrets; Apple signing/notarization secrets are absent. The user was asked to add the six `APPLE_*` secrets without sharing values in chat.
- Item 100 is still open. No new GitHub Release/tag has been created.
- The repository was clean immediately after syncing `bf247b3`. Preserve any new local changes. Do not stage `.playwright-*`, `.research`, `.tmp-icons`, the inspection screenshot, or the unrelated 2026-11-01 plans/spec.

## Latest phase completed

Items 51–53 were implemented locally:

- 51: PDF merge with selectable order.
- 52: PDF split by page numbers and ranges.
- 53: PDF page reorder and per-page rotation through optional `qpdf`.

Historical verification for items 51–53: `npm test` passed 70 tests, `npm run build` passed, Rust tests passed 57 tests, and `git diff --check` passed. The `qpdf` executable was absent then, so item 53 was not exercised end-to-end against a real PDF.

## Useful starting points

- Item 54 is “Control DPI for exported pages; constrain DPI to a safe range and show it before image creation.”
- Image-to-PDF currently lives in `src/conversion/pdf.ts` (`imagesToPdf`). It uses `createImageBitmap`, then writes bitmap pixel dimensions directly into the PDF `/MediaBox`; quality is passed from the quick menu in `src/quick-menu/QuickMenu.tsx`.
- PDF UI and native integrations added in recent phases are under `src/pdf/`, `src/pdf-merge.ts`, `src/pdf-split.ts`, `src/pdf-pages.ts`, `src-tauri/src/main.rs`, and `src-tauri/src/operations.rs`.

## Prompt to continue later

```text
Continue the FlickVert improvement roadmap from the current repository. First read docs/superpowers/HANDOFF.md and docs/superpowers/plans/2026-11-03-flickvert-100-improvements.md, then inspect `git status` and preserve every existing local change. Do not reset, clean, or replace files wholesale.

Important: current unchecked items are 90, 92, 94, and 100. Items 1–19 have already been audited. Continue with item 90, preserve the current work in progress, and create the next release only after all four remaining items are verified.

Work in small, reviewable phases. Before editing, inspect every relevant caller, UI path, config, and test. Add or update focused tests for behavior changes, run the relevant project tests and build, review `git diff --check`, and mark a plan item `[x]` only after its acceptance criteria are verified. Keep UI behavior and copy consistent with FlickVert's existing components and translations. Preserve local processing and user files.

If publishing is explicitly requested, use PavelCRG, verify the target branch first, and use ordinary push/tag operations; never force-push. If an external tool or credential is absent, state exactly what could not be verified and continue with independent work.
```
