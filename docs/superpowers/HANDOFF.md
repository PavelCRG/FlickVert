# FlickVert roadmap handoff

## Current state

- User approved a Windows-only release sequence: publish the existing `v0.1.4` tag first, then publish current work as `v0.1.5`. Do not start `v0.1.5` until `v0.1.4` has a successful GitHub Release.
- Apple/macOS builds and signing are paused by user request. The active CI/release workflow and current download documentation target Windows x64. Cross-platform application source remains available.
- Current edits include the user's UI/product work, Windows-only release pipeline, Windows update manifest, updated release docs, and version `0.1.5`. Preserve every change; never reset, clean, or force-push.
- Git identity for publishing: `PavelCRG <pavelslepcov864@gmail.com>`. User explicitly authorized publishing in this session.
- `v0.1.4` already exists as a tag but has no GitHub Release. Use the workflow's manual `release_tag` input to build that tag and create its release from the current workflow. Then tag/publish `v0.1.5` from main.

## Plan status audit

- Roadmap items 1–93 and 95–99 are marked complete from prior verified work.
- Item 94 (Apple signing/notarization) is deferred at the user's direction while Apple releases are paused.
- Item 100 remains open until Windows `v0.1.4` and then `v0.1.5` builds/release checks both complete.
## Current verification (2026-11-05)

- The worktree has uncommitted user changes. Preserve them; do not reset, clean, commit, or push without the user's explicit approval to publish.
- At `3d42643`, `npm test` passed 102/102, `npm run build` passed, and `cargo test --locked --manifest-path src-tauri/Cargo.toml` passed 81 tests with one manual large-file test ignored. The 256 MiB ZIP sample passed separately.
- GitHub Actions run `41842547243` for `3d42643` completed successfully on retry attempt 2: Windows install/reinstall/uninstall and portable packaging passed; macOS Intel and Apple Silicon builds passed. Attempt 1 had a transient Windows uninstall registration failure.
- Release tag run `41838578247` failed the macOS jobs before bundling because the six `APPLE_*` credentials are absent. The tagged workflow checks code signatures, Gatekeeper, and stapled notarization tickets on both architectures once those secrets exist.
- `v0.1.4` was tagged at the release-preparation commit before `3d42643`; it does not contain the launcher-choice commit or the current uncommitted UI changes. Do not publish that tag as if it represented the current worktree.
- Item 100 remains open: the user approved two sequential releases (`v0.1.4`, then `v0.1.5`). Before publishing each, provide its concrete change list and verify all release gates; do not start `v0.1.5` before `v0.1.4` is published.
- `v0.1.5` is for current main and approved local changes. Git identity was verified as `PavelCRG <pavelslepcov864@gmail.com>` on 2026-11-05.

## Current verification (2026-11-03)

- At `bf247b3`, `npm ci` completed from the lockfile, `npm test` passed 100/100, `npm run build` passed, and `cargo test --locked` passed 81/81 on Windows. After the shared-WebView-profile change below, `npm test` again passed 100/100, `npm run build` passed, `cargo test --locked` passed 81/81, and `cargo build --locked` passed. The ignored ZIP memory sample also passed. A native Windows installer was not rebuilt in this session.
- Windows installer test passed using the published `v0.1.3` installer followed by the current installer, then uninstall. It verified one uninstall registration and preservation of user-data and selected-file sentinels. Both installers identify as `0.1.3`, so verify a true `v0.1.3` → `v0.1.4` transition before closing item 92.
- GitHub Actions for commit `4a929b7`: Windows and Apple Silicon passed; Intel macOS failed during DMG packaging. The full log shows Tauri mounts `bundle/macos/rw.<pid>.FlickVert_<version>_x64.dmg`; the previous retry incorrectly searched `bundle/dmg` for the final image, which did not exist yet.
- Commit `bf247b3` contains the version/architecture-specific DMG retry fix under `bundle/macos`. The DMG mock test passed for Intel and Apple Silicon before the commit; GitHub Actions results for `bf247b3` were not checked in this session.
- Item 90 is complete in the roadmap. `docs/performance-budget.md` records reproducible cold-start, quick-open p50/p95, catalog-search p50/p95, and ZIP large-file measurements; the 256 MiB ZIP sample was rerun successfully on 2026-11-05. It explicitly excludes the resident application/WebView2 from the ZIP worker memory measurement.
- Item 94 is still open. The exact Apple secret requirements and secure setup steps are in `docs/release-signing.md`. Values must be added directly to GitHub Actions Secrets; never share or commit them.
- Item 100 is still open. No new GitHub Release/tag has been created, and publication awaits the user's approval after the final change list.
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

Important: only items 94 and 100 are unchecked in the current roadmap. Item 94 needs the six Apple signing/notarization secrets documented in `docs/release-signing.md`; item 100 also needs explicit user approval before publication. Preserve the current work in progress.

Work in small, reviewable phases. Before editing, inspect every relevant caller, UI path, config, and test. Add or update focused tests for behavior changes, run the relevant project tests and build, review `git diff --check`, and mark a plan item `[x]` only after its acceptance criteria are verified. Keep UI behavior and copy consistent with FlickVert's existing components and translations. Preserve local processing and user files.

If publishing is explicitly requested, use PavelCRG, verify the target branch first, and use ordinary push/tag operations; never force-push. If an external tool or credential is absent, state exactly what could not be verified and continue with independent work.
```
