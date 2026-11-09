# Contributing to FlickVert

Thanks for helping improve FlickVert. Bug reports and feature ideas are welcome in English or Russian.

## Report a bug

[Open the bug report form](https://github.com/PavelCRG/FlickVert/issues/new?template=bug_report.yml). Include:

- FlickVert version and Windows version
- What you did, what you expected, and what happened
- The smallest set of steps that reproduces the problem

Do not attach personal files, private data, signing keys, or other secrets. If a file type matters, describe it or use a safe sample.

For an idea, [open a feature request](https://github.com/PavelCRG/FlickVert/issues/new?template=feature_request.yml) and explain the problem it would solve.

## Set up the project

FlickVert is a Tauri desktop app with a React/TypeScript frontend and a Rust backend. Development builds currently target Windows.

Install Node.js 24, stable Rust, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/). Then run:

~~~sh
npm ci
npm run dev
~~~

Optional conversion engines such as FFmpeg, ImageMagick, Pandoc, LibreOffice, and Poppler are only needed to manually exercise the formats that use them.

## Verify changes

Before opening a pull request, run:

~~~sh
npm run check
~~~

This runs the frontend tests, TypeScript/frontend build, and Rust tests. The same check runs in GitHub Actions for pushes and pull requests. For UI changes, include a screenshot and note the Windows version you checked.

Keep changes focused. Add or update tests when behavior changes, preserve the original file on exports, and update CHANGELOG.md for user-visible changes.

## Pull requests

Describe the user problem and the change, link a related issue when there is one, and list the checks you ran. The repository workflow builds the Windows app and checks installer behavior after the automated test suite passes.
