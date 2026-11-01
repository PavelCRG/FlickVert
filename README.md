<img align="left" src="public/fv-file-orange.png" width="120" alt="FlickVert logo" />

# FlickVert

A small, local file converter for Windows and macOS.

<br clear="left" />
<div align="center">
  <p>
    <a href="#quick-start"><img alt="Quick start" src="https://img.shields.io/badge/Quick%20start-Drag%20%26%20convert-285FE8?style=for-the-badge"></a>
    <a href="#supported-formats"><img alt="Supported formats" src="https://img.shields.io/badge/Formats-What%20works-59616D?style=for-the-badge"></a>
    <a href="#build-from-source"><img alt="Build from source" src="https://img.shields.io/badge/Build-From%20source-59616D?style=for-the-badge"></a>
  </p>
  <p><a href="README.ru.md">Русский</a> · <a href="README.zh-CN.md">简体中文</a></p>
</div>

FlickVert sits beside File Explorer and Finder. Drag a file and press Shift to open the circular action wheel beside the pointer. Drop the file on a format or action to run it. The main window has history and settings.

<p align="center">
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Setup.msi"><strong>Windows installer (MSI)</strong></a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Setup.exe">Windows installer (EXE)</a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Portable.zip">Windows portable (ZIP)</a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-macOS-Apple-Silicon.dmg">macOS Apple Silicon</a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-macOS-Intel.dmg">macOS Intel</a>
</p>
<p align="center">macOS images are currently unsigned and may show a first-open security warning.</p>

## Install from the terminal

On **Windows 10/11 x64**, open PowerShell. This downloads the latest MSI and opens its installer:

```powershell
$release = 'https://github.com/PavelCRG/FlickVert/releases/latest/download'
$setup = Join-Path $env:TEMP 'FlickVert.msi'
Invoke-WebRequest "$release/FlickVert-Windows-x64-Setup.msi" -OutFile $setup
if ($?) { Start-Process msiexec.exe -ArgumentList @('/i', ('"{0}"' -f $setup)) }
```

On **macOS 13 or later**, run these commands. Open the downloaded image and drag FlickVert into Applications.

```sh
release=https://github.com/PavelCRG/FlickVert/releases/latest/download
case "$(uname -m)" in
  arm64) chip=Apple-Silicon ;; x86_64) chip=Intel ;;
  *) chip=unsupported ;;
esac
curl -fL "$release/FlickVert-macOS-$chip.dmg" -o ~/Downloads/FlickVert.dmg &&
open ~/Downloads/FlickVert.dmg
```

The commands require a published release containing these installers. Windows requires WebView2 Runtime; the macOS builds are unsigned.

After installing a release that includes the updater, FlickVert checks for signed updates at startup and every six hours while running. Use **Updates** in the sidebar to check again and install an available update. On Windows, the app selects the matching EXE or MSI update automatically. The portable build must be updated manually from GitHub Releases.

## Contents

- [Install from the terminal](#install-from-the-terminal)
- [Quick start](#quick-start)
- [Close and reopen](#close-and-reopen)
- [How the drag wheel works](#how-the-drag-wheel-works)
- [Supported formats](#supported-formats)
- [Where files are saved](#where-files-are-saved)
- [Build from source](#build-from-source)
- [Privacy](#privacy)

## Quick start

1. Start FlickVert. Its settings window opens and the drag wheel is available while the app is running.
2. Drag a file, press **Shift**, and drop it onto a format in the wheel beside the pointer.
3. Find the converted file beside the original. Use the main window to view history or change settings.

## Closing the app

Closing the main window quits FlickVert. The drag wheel and global shortcut are available while the application is running.

The default shortcut, **Ctrl+Alt+Space**, opens quick actions for files selected in Explorer or Finder. You can also drop a file onto the wheel. Use **1/2/3** to switch modes, arrow keys to select a target, and **Enter** to run it. **Esc** closes the wheel. Change the shortcut in **Settings**.

While dragging, press **Ctrl** (Windows) or **Command** (macOS) for tools, or **Alt** (Windows) / **Control** (macOS) for file actions. The tools wheel can resize, rotate, flip, grayscale, square-crop, compress, remove image metadata, or combine up to 100 images into a PDF. HEIC, AVIF, TIFF, and SVG tools require ImageMagick; these save PNG or JPEG output. With FFmpeg installed, the wheel also offers video compression, mute, audio extraction, thumbnails, audio compression, and loudness normalization. Actions can create or safely extract ZIP archives, copy or move selected files and folders to `Downloads/FlickVert`, reveal one item in Explorer/Finder, copy its path, or open its folder in a terminal.

For detailed image work, choose **Edit image** in Tools. The editor can crop or redact a selected area, add a text annotation or background fill, and adjust brightness and contrast. It saves a new PNG beside the source and leaves the original unchanged.

## How the drag wheel works

1. Start dragging a selected file from File Explorer or Finder with either mouse button.
2. Tap **Shift** for formats, **Ctrl** (Windows) or **Command** (macOS) for tools, or **Alt** (Windows) / **Control** (macOS) for file actions. The wheel stays open after releasing the key.
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

See the [project structure](docs/architecture.md) for a map of the frontend, native code, and build pipeline.

Install Node.js 24, stable Rust, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/). Then run:

```sh
npm ci
npm run dev
```

Run `npm test` and `cargo test --locked --manifest-path src-tauri/Cargo.toml` to check the frontend and native code. Run `npm run tauri -- build` to create a local desktop build.

### Publishing an update

Set the repository's `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub Actions secrets to the signing key corresponding to the public key in `src-tauri/tauri.conf.json`. Keep the private key outside the repository. Update the app version, then push a matching tag such as `v0.2.1`: the release workflow builds the installers, signs update artifacts, and publishes `latest.json`. An existing installation can only install updates signed by its configured key.

FlickVert supports Windows 10/11 and macOS 13 or later. On macOS, allow Accessibility and Input Monitoring access for the drag wheel. The configured keyboard shortcut is an alternative for opening quick actions.

## Privacy

Files are processed locally and are never uploaded. Optional conversion engines run on your device.

## Languages

- [Русский](README.ru.md)
- [简体中文](README.zh-CN.md)
