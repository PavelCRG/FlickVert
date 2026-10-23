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

FlickVert sits beside File Explorer and Finder. Start dragging a file and the circular action wheel appears beside the pointer. Drop the file on a format or action to run it. The main window has history and settings.

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

1. Start FlickVert. The start screen opens once; closing it leaves FlickVert in the tray while you work in File Explorer or Finder.
2. Drag a file and drop it onto a format in the wheel beside the pointer.
3. Find the converted file beside the original. Open the main window from the tray for the start screen, history, and settings.

## Closing the app

Closing the main window keeps FlickVert in the tray. Choose **Show FlickVert** from the tray menu to reopen it, or **Quit** to stop the background helper.

The default shortcut, **Ctrl+Alt+Space**, opens quick actions for files selected in Explorer or Finder. You can also drop a file onto the wheel. Use **1/2/3** to switch modes, arrow keys to select a target, and **Enter** to run it. **Esc** closes the wheel. Change the shortcut in **Settings**.

While dragging, press **Ctrl** (Windows) or **Command** (macOS) for tools, or **Alt/Option** for file actions. The tools wheel can resize, rotate, flip, grayscale, square-crop, compress, remove image metadata, or combine up to 100 images into a PDF. HEIC, AVIF, TIFF, and SVG tools require ImageMagick; these save PNG or JPEG output. With FFmpeg installed, the wheel also offers video compression, mute, audio extraction, thumbnails, audio compression, and loudness normalization. Actions can create or safely extract ZIP archives, copy or move selected files and folders to `Downloads/FlickVert`, reveal one item in Explorer/Finder, copy its path, or open its folder in a terminal.

For detailed image work, choose **Edit image** in Tools. The editor can crop or redact a selected area, add a text annotation or background fill, and adjust brightness and contrast. It saves a new PNG beside the source and leaves the original unchanged.

## How the drag wheel works

1. Start dragging a selected file from File Explorer or Finder with either mouse button.
2. The format wheel opens as soon as the drag starts. Hold **Ctrl** (Windows) or **Command** (macOS) for tools, or **Alt/Option** for file actions.
3. Move over a choice and release the mouse button to run it. Press **Esc** to cancel.

The wheel needs a file drag that starts in Explorer or Finder. You can also open the wheel with the global shortcut and then drag a file onto it.

## Supported formats

| Files | Available formats | Notes |
| --- | --- | --- |
| Images | PNG, JPEG, WebP, BMP, SVG, HEIC, TIFF, AVIF, PDF | PNG/JPEG/WebP/PDF output from common images and SVG is built in. HEIC/TIFF/AVIF and RAW input need ImageMagick. Animated GIFs use the first frame in built-in conversions. |
| Audio and video | Depends on FFmpeg | Install FFmpeg separately. |
| Subtitles | SRT, VTT, ASS | Requires FFmpeg; converts between these subtitle formats. |
| Text documents and ebooks | Depends on Pandoc | Install Pandoc separately. |
| Office documents to PDF | Depends on LibreOffice | Install LibreOffice separately. |
| Spreadsheets | XLSX, ODS, CSV | LibreOffice converts between these; XLS is input only. |
| Slides | PPT/PPTX/ODP to PDF, PNG, JPEG | LibreOffice is required; PNG/JPEG also need Poppler and save all slides in a new folder. |
| PDF input | PNG, JPEG, TXT, Markdown; DOCX and EPUB with Pandoc | Install Poppler. Images from all pages are saved in a new folder at 300 DPI. Text and document output needs selectable text and does not preserve the original PDF layout. |
| Camera RAW | Depends on ImageMagick | Install ImageMagick separately. |
| Archives | ZIP create and extract | Saved beside the selected file; unsafe paths and links are rejected. |

**Still missing:** OCR for scanned PDFs; PDF to PAGES/PPTX/XLSX; TAR/GZIP/RAR; interactive audio/video trim, split and merge.

## Where files are saved

- By default, converted files are saved beside their originals. Choose another folder in **Settings → Output settings** to use it for conversions, image and media tools, PDF exports, and ZIP archives.
- Choosing **Save beside original** clears the custom folder and restores the default.
- Existing files are kept. If a name is taken, FlickVert adds a number, such as `photo (2).webp`.

## Build from source

Install Node.js 24, stable Rust, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/). Then run:

```sh
npm ci
npm run dev
```

FlickVert supports Windows 10/11 and macOS 13 or later. On macOS, allow Accessibility and Input Monitoring access for the drag wheel. The configured keyboard shortcut is an alternative for opening quick actions.

## Privacy

Files are processed locally and are never uploaded. Optional conversion engines run on your device.

## Languages

- [Русский](README.ru.md)
- [简体中文](README.zh-CN.md)
