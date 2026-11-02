# FlickVert roadmap handoff

## Current state

- The user asked to pause the roadmap. The active goal is paused; do not resume implementation until asked.
- Source of truth: `docs/superpowers/plans/2026-11-03-flickvert-100-improvements.md`.
- The worktree already contains broad uncommitted changes from earlier work. Preserve them. Do not run `git reset`, `git clean`, or overwrite files wholesale.
- Do not commit or push. The user requires GitHub changes to be published under their own identity; only publish after confirming the configured identity is Pavel's and receiving explicit approval.

## Plan status audit

At handoff, checked plan items are 20–53, 67, and 71. The unchecked items are 1–19, 54–66, 68–70, and 72–100. Although the latest implementation reached item 53, the next roadmap work must first reconcile items 1–19 against the actual code and their acceptance criteria. Do not assume item 54 is the next task and do not mark an item complete based only on similar-looking code.

## Latest phase completed

Items 51–53 were implemented locally:

- 51: PDF merge with selectable order.
- 52: PDF split by page numbers and ranges.
- 53: PDF page reorder and per-page rotation through optional `qpdf`.

Latest verification evidence: `npm test` passed 70 tests, `npm run build` passed, Rust tests passed 57 tests, and `git diff --check` passed. The `qpdf` executable is absent in this environment, so item 53 has not been exercised end-to-end against a real PDF. The existing worktree changes are uncommitted.

## Useful starting points

- Item 54 is “Control DPI for exported pages; constrain DPI to a safe range and show it before image creation.”
- Image-to-PDF currently lives in `src/conversion/pdf.ts` (`imagesToPdf`). It uses `createImageBitmap`, then writes bitmap pixel dimensions directly into the PDF `/MediaBox`; quality is passed from the quick menu in `src/quick-menu/QuickMenu.tsx`.
- PDF UI and native integrations added in recent phases are under `src/pdf/`, `src/pdf-merge.ts`, `src/pdf-split.ts`, `src/pdf-pages.ts`, `src-tauri/src/main.rs`, and `src-tauri/src/operations.rs`.

## Prompt to continue later

```text
Continue the FlickVert improvement roadmap from the existing worktree. First read docs/superpowers/HANDOFF.md and docs/superpowers/plans/2026-11-03-flickvert-100-improvements.md, then inspect `git status` and preserve every existing uncommitted change. Do not reset, clean, or replace files wholesale.

Important: the plan currently marks items 20–53, 67, and 71 complete, while items 1–19 are still unchecked. The previous implementation reached item 53, but do not jump directly to item 54. Audit items 1–19 against their stated acceptance criteria and current code; verify each before marking it complete, and implement the first genuinely incomplete item. Then continue in roadmap order.

Work in small, reviewable phases. Before editing, inspect every relevant caller, UI path, config, and test. Add or update focused tests for behavior changes, run the relevant project tests and build, review `git diff --check`, and mark a plan item `[x]` only after its acceptance criteria are verified. Keep UI behavior and copy consistent with FlickVert's existing components and translations. Preserve local processing and user files.

Do not commit or push. The user requires any eventual GitHub publication to use their own identity; publishing also requires explicit approval. If a required external tool is absent (for example qpdf), state exactly what could not be tested and continue with independent work.
```
