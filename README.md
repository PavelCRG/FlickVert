<div align="center">
  <img src="public/fv-file-orange.png" width="190" alt="FlickVert logo" />
  <h1>FlickVert</h1>
  <p><strong>File conversion, right where you need it.</strong></p>
  <p>A fast, local-first file toolkit for Windows and macOS.</p>
  <p><a href="README.ru.md">Русский</a> · <a href="README.zh-CN.md">简体中文</a></p>
</div>

<p align="center">Drag a file, tap <kbd>Shift</kbd>, and drop it on a format. Convert, edit, and organize files without leaving Explorer or Finder.</p>

<p align="center">
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Setup.exe"><strong>Download for Windows</strong></a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-macOS-Apple-Silicon.dmg"><strong>Download for macOS</strong></a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Portable.zip">Portable ZIP</a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest">All downloads</a>
</p>
<p align="center"><sub>Windows 10/11 · macOS 13+ · Free · Files stay on your device</sub></p>
## Download and install

On **Windows 10/11 x64**, download and open the Setup EXE above. The MSI is also available on the [releases page](https://github.com/PavelCRG/FlickVert/releases/latest). To run without installing, download the Portable ZIP and open `FlickVert.exe` inside it. Windows may show a SmartScreen warning because the installer is not Authenticode-signed.

To install the latest Windows release from PowerShell, run:

```powershell
$installer = Join-Path $env:TEMP 'FlickVert-Setup.exe'; Invoke-WebRequest 'https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Setup.exe' -OutFile $installer; Start-Process $installer -Wait; Remove-Item $installer
```

On **macOS 13 or later**, download the DMG for Apple Silicon or Intel from the [releases page](https://github.com/PavelCRG/FlickVert/releases/latest), open it, and drag FlickVert into Applications. These builds are not notarized and macOS may show a first-open security warning.

Windows requires the Microsoft Edge WebView2 Runtime. Optional conversion engines are installed separately.

After installing a release that includes the updater, FlickVert checks for signed updates at startup and every six hours while running. Use **Updates** in the sidebar to check again and install an available update. On Windows, the app selects the matching EXE or MSI update automatically. The portable build must be updated manually from GitHub Releases.

## Contents

- [Download and install](#download-and-install)
- [Quick start](#quick-start)
- [Close and reopen](#close-and-reopen)
- [How the drag wheel works](#how-the-drag-wheel-works)
- [Supported formats](#supported-formats)
- [Where files are saved](#where-files-are-saved)
- [Build from source](#build-from-source)
- [Privacy](#privacy)

## Quick start

1. Start FlickVert. The Quick start guide appears on first launch; the settings window opens on later launches.
2. Drag a file, press **Shift**, and drop it onto a format in the wheel beside the pointer.
3. Find the converted file beside the original. Use Home to browse supported formats and Settings to customize the app.

## Closing the app

Closing the main window hides FlickVert to the system tray. The drag wheel and global shortcut keep working in the background. Choose **Quit** from the tray menu to exit FlickVert completely.

The default shortcut, **Ctrl+Alt+Space**, opens quick actions for files selected in Explorer or Finder. You can also drop a file onto the wheel. Use **1/2/3** to switch modes, arrow keys to select a target, and **Enter** to run it. **Esc** closes the wheel. Change the shortcut in **Settings**.

While dragging, press **Ctrl** (Windows) or **Command** (macOS) for tools, or **Alt** (Windows) / **Control** (macOS) for file actions. The tools wheel can resize, rotate, flip, grayscale, square-crop, compress, remove image metadata, or combine up to 100 images into a PDF. HEIC, AVIF, TIFF, and SVG tools require ImageMagick; these save PNG or JPEG output. With FFmpeg installed, the wheel also offers video compression, mute, audio extraction, thumbnails, audio compression, and loudness normalization. Actions can create or safely extract ZIP archives, copy or move selected files and folders to `Downloads/FlickVert`, reveal one item in Explorer/Finder, copy its path, or open its folder in a terminal.

For detailed image work, choose **Edit image** in Tools. The editor can crop or redact a selected area, add a text annotation or background fill, and adjust brightness and contrast. It saves a new PNG beside the source and leaves the original unchanged.

## How the drag wheel works

1. Start dragging a selected file from File Explorer or Finder with the left mouse button.
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

Current release: `v0.1.1`. Push a version tag such as `v0.1.1` to run the GitHub Actions release workflow. It builds Windows and macOS downloads, signs updater packages, and publishes `latest.json`. Installed copies check for updates at launch and every six hours. Portable Windows builds update manually. `scripts/publish-v0.1.0.ps1` was the one-time first-release procedure.

The repository must have `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` Actions secrets matching the public key in `src-tauri/tauri.conf.json`. Keep the private key outside the repository. An existing installation only accepts updates signed with its configured key.

FlickVert supports Windows 10/11 and macOS 13 or later. On macOS, allow Accessibility and Input Monitoring access for the drag wheel. The configured keyboard shortcut is an alternative for opening quick actions.

## Privacy

Files are processed locally and are never uploaded. Optional conversion engines run on your device.

## Languages

- [Русский](README.ru.md)
- [简体中文](README.zh-CN.md)
