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

1. Open FlickVert and drop one or more files into the window, or choose an image with **Browse**.
2. Pick an output format and start the conversion.
3. Find the converted file beside the original. Images chosen with **Browse** go to `Downloads/FlickVert`.

## Close and reopen

Closing the window keeps FlickVert running in the notification area so the drag wheel and shortcut remain available. Open the tray icon menu and choose **Show FlickVert** to bring the window back. Choose **Quit** there to exit the app.

The default shortcut, **Ctrl+Alt+Space**, opens quick actions. Change it in **Settings**.

While dragging, tap and release **Ctrl** (Windows) or **Command** (macOS) for image tools, or **Alt** for file actions. The tools wheel can resize, rotate, flip, grayscale, square-crop, or compress images. Release the mouse on a wheel segment to apply it; results are saved beside the original with a suffix. Actions can copy or move one file to `Downloads/FlickVert`, reveal it in Explorer/Finder, or copy its path.

## How the drag wheel works

1. Start dragging a file from File Explorer or Finder with the left mouse button.
2. While still holding the mouse button, press and release **Shift**. The format wheel opens under the pointer.
3. Move over a format and release the mouse button to convert. Press **Esc** to cancel.

The wheel needs a file drag that starts in Explorer or Finder. Selecting a file with **Browse** does not start this gesture.

## Supported formats

| Files | Available formats | Notes |
| --- | --- | --- |
| Images | PNG, JPEG, WebP | Built in; GIF and BMP can be used as input. Animated GIFs use their first frame. |
| Audio and video | Depends on FFmpeg | Install FFmpeg separately. |
| Subtitles | SRT, VTT, ASS | Requires FFmpeg; converts between these subtitle formats. |
| Text documents and ebooks | Depends on Pandoc | Install Pandoc separately. |
| Office documents to PDF | Depends on LibreOffice | Install LibreOffice separately. |
| Camera RAW | Depends on ImageMagick | Install ImageMagick separately. |

## Where files are saved

- Files dropped from Explorer or Finder are saved beside their originals.
- Images selected with **Browse** are saved to `Downloads/FlickVert`.
- Existing files are kept. If a name is taken, FlickVert adds a number, such as `photo (2).webp`.

## Build from source

Install Node.js 24, stable Rust, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/). Then run:

```sh
npm ci
npm run tauri dev
```

FlickVert supports Windows 10/11 and macOS 13 or later. On macOS, allow Accessibility and Input Monitoring access for the Shift drag wheel. The configured keyboard shortcut is an alternative for opening quick actions.

## Privacy

Files are processed locally and are never uploaded. Optional conversion engines run on your device.

## Languages

- [Русский](README.ru.md)
- [简体中文](README.zh-CN.md)
