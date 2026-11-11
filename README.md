<div align="center">
  <img src="public/fv-file-orange.png" width="96" alt="FlickVert logo" />
  <h1>FlickVert</h1>
  <p>Local-first tools to convert, edit, and organize files on Windows.</p>
  <p>
    <a href="https://github.com/PavelCRG/FlickVert/releases/latest"><strong>Download for Windows</strong></a> ·
    <a href="https://github.com/PavelCRG/FlickVert/issues/new?template=bug_report.yml">Report a bug</a> ·
    <a href="CONTRIBUTING.md">Contribute</a>
  </p>
  <p><a href="README.ru.md">Русский</a> · <a href="README.zh-CN.md">简体中文</a></p>
  <a href="https://github.com/PavelCRG/FlickVert/actions/workflows/desktop-build.yml?query=branch%3Amain"><img src="https://github.com/PavelCRG/FlickVert/actions/workflows/desktop-build.yml/badge.svg?branch=main" alt="Desktop build status" /></a>
</div>

FlickVert is a Windows desktop app for working with files without uploading them. Drag a file, choose an action from the wheel, and save a new result beside the original or in a folder you choose.

## Download

The latest release includes a Windows installer and a portable ZIP. Setup lets you choose an install folder and installs for your Windows user without requiring administrator rights. The portable ZIP can be extracted to any writable drive and is updated manually. App settings stay in your Windows user profile. Windows may show a SmartScreen warning because the installer is not Authenticode-signed. Windows 10/11 and Microsoft Edge WebView2 Runtime are required.

[Open the latest release and checksums](https://github.com/PavelCRG/FlickVert/releases/latest).

[Verify downloads and build origin](docs/download-verification.md).

## Quick start

1. Start dragging a file from File Explorer and press **Shift** to open the conversion wheel.
2. Press **Ctrl** for tools or **Alt** for file actions. Release the modifier, point to an action, and release the mouse button to run it.
3. Press **Ctrl+Alt+Space** to open quick actions for selected files. Press **Esc** to close the wheel.

The main window has the tools catalog, settings, and a quick-start guide. Closing it keeps FlickVert in the system tray; choose **Quit** there to exit.

## What it can do

FlickVert offers the operations implemented inside the app. It does not look for or launch separate converter programs.

| Files | Built-in operations |
| --- | --- |
| Images | Convert common raster and SVG formats; resize, rotate, crop, compress, remove metadata, and create PDFs from images |
| PDF | Extract selectable text; merge, split, reorder, and rotate pages |
| Documents | Convert Markdown, HTML, and text; extract text from RTF, DOCX, ODT, and EPUB |
| Spreadsheets | Convert CSV and TSV; convert a single-sheet XLSX to CSV/TSV and TSV to XLSX |
| Subtitles | Convert SRT and VTT |
| Audio | Convert AIFF, FLAC, M4A, MP3, MKA, OGA, and OGG audio to WAV |
| Archives | Create and extract ZIP, TAR, TAR.GZ, TGZ, and GZIP |

Formats without an in-app implementation are not offered. FlickVert uses third-party Rust crates; their code remains under their respective licenses and is not claimed as original FlickVert code. Audio decoding uses Symphonia (MPL 2.0); source and license details are included with the installer.

## Files and privacy

- Results go beside the source by default. Choose another output folder in **Settings** when needed.
- Existing files are never overwritten; FlickVert adds a number to a conflicting output name.
- Files are processed on your device. FlickVert does not upload files or use analytics. Installed builds contact GitHub Releases only to check for and download signed updates.

## Report a problem

[Open a bug report](https://github.com/PavelCRG/FlickVert/issues/new?template=bug_report.yml) or [suggest a feature](https://github.com/PavelCRG/FlickVert/issues/new?template=feature_request.yml). Reports in English or Russian are welcome. Include your FlickVert version, Windows version, and steps to reproduce. Do not attach private files or secrets.

## Development

Install Node.js 24, stable Rust, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/). Then run:

~~~sh
npm ci
npm run dev
~~~

Useful checks and build commands:

~~~sh
npm run check
npm test
npm run build
npm run test:rust
npm run tauri -- build
~~~

**npm run check** runs the frontend tests, frontend build, and Rust tests. See [Contributing](CONTRIBUTING.md) for the development workflow and [Releasing](docs/releasing.md) for preparing a version and publishing a release.
