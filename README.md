<div align="center">
  <img src="public/fv-mark.svg" width="72" height="48" alt="FlickVert FV mark" />
  <h1>FlickVert</h1>
  <p>A small, local file converter for Windows and macOS.</p>
  <p>
    <a href="#quick-start"><img alt="Quick start" src="https://img.shields.io/badge/Quick%20start-Drag%20%26%20convert-E8783D?style=for-the-badge"></a>
    <a href="#supported-formats"><img alt="Supported formats" src="https://img.shields.io/badge/Formats-What%20works-59616D?style=for-the-badge"></a>
    <a href="#build-from-source"><img alt="Build from source" src="https://img.shields.io/badge/Build-From%20source-59616D?style=for-the-badge"></a>
  </p>
  <p><a href="README.ru.md">Русский</a> · <a href="README.zh-CN.md">简体中文</a></p>
</div>

FlickVert sits beside File Explorer and Finder. Drop a file onto the app, choose a format, and save the result on your device.

<p align="center"><a href="https://github.com/PavelCRG/FlickVert/releases/latest"><strong>Download FlickVert for Windows or macOS →</strong></a></p>

## Contents

- [Quick start](#quick-start)
- [Close and reopen](#close-and-reopen)
- [How the drag wheel works](#how-the-drag-wheel-works)
- [Supported formats](#supported-formats)
- [Where files are saved](#where-files-are-saved)
- [Build from source](#build-from-source)
- [Privacy](#privacy)

## Quick start

1. Start FlickVert. It stays in the tray while you work in File Explorer or Finder.
2. Drag a file, press **Shift**, and drop it onto a format in the wheel beside the pointer.
3. Find the converted file beside the original. Open the main window from the tray for settings, history, or manual conversion.

## Closing the app

Closing the main window keeps FlickVert in the tray. Choose **Show FlickVert** from the tray menu to reopen it, or **Quit** to stop the background helper.

The default shortcut, **Ctrl+Alt+Space**, opens quick actions. Change it in **Settings**.

While dragging, press **Ctrl** (Windows) or **Command** (macOS) for tools, or **Alt/Option** for file actions. The tools wheel can resize, rotate, flip, grayscale, square-crop, compress images, or combine up to 100 images into a PDF. With FFmpeg installed, it also offers video compression, mute, audio extraction, thumbnails, audio compression, and loudness normalization. Actions can create or safely extract ZIP archives, copy or move selected files and folders to `Downloads/FlickVert`, reveal one item in Explorer/Finder, copy its path, or open its folder in a terminal.

## How the drag wheel works

1. Start dragging a file from File Explorer or Finder with the left mouse button.
2. While still holding the mouse button, press **Shift**. The format wheel opens under the pointer; you can then release Shift.
3. Move over a format and release the mouse button to convert. Press **Esc** to cancel.

The wheel needs a file drag that starts in Explorer or Finder. Selecting a file with **Browse** does not start this gesture.

## Supported formats

| Files | Available formats | Notes |
| --- | --- | --- |
| Images | PNG, JPEG, WebP, GIF, BMP, HEIC, TIFF, AVIF, SVG, camera RAW | PNG/JPEG/WebP are built in. HEIC, TIFF, AVIF, SVG, and RAW need ImageMagick. |
| Audio and video | Depends on FFmpeg | Install FFmpeg separately. |
| Subtitles | SRT, VTT, ASS | Requires FFmpeg; converts between these subtitle formats. |
| Text documents and ebooks | Depends on Pandoc | Install Pandoc separately. |
| Office documents to PDF | Depends on LibreOffice | Install LibreOffice separately. |
| Camera RAW | Depends on ImageMagick | Install ImageMagick separately. |
| Archives | ZIP create and extract | Saved beside the selected file; unsafe paths and links are rejected. |

## Where files are saved

- Files dropped from Explorer or Finder are saved beside their originals.
- Images selected with **Browse** are saved to `Downloads/FlickVert`.
- Existing files are kept. If a name is taken, FlickVert adds a number, such as `photo (2).webp`.

## Build from source

Install Node.js 24, stable Rust, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/). Then run:

```sh
npm ci
npm run dev
```

FlickVert supports Windows 10/11 and macOS 13 or later. On macOS, allow Accessibility and Input Monitoring access for the Shift drag wheel. The configured keyboard shortcut is an alternative for opening quick actions.

## Privacy

Files are processed locally and are never uploaded. Optional conversion engines run on your device.

## Languages

- [Русский](README.ru.md)
- [简体中文](README.zh-CN.md)
