<div align="center">
  <img src="public/fv-file-orange.png" width="120" alt="FlickVert logo" />
  <h1>FlickVert</h1>
  <p><strong>File work, one quick gesture away.</strong></p>
  <p><a href="README.ru.md">Русский</a> · <a href="README.zh-CN.md">简体中文</a></p>
</div>

<p align="center">Convert, edit, and organize locally on Windows.</p>
<p align="center">Drag a file. Tap <kbd>Shift</kbd>. Choose a format.</p>

<p align="center">
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Setup.exe"><strong>Download for Windows</strong></a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Portable.zip">Portable ZIP</a>
</p>
<p align="center"><sub>Windows 10/11 · Free · Files stay on your device</sub></p>

## Download and install

On **Windows 10/11 x64**, download and open the Setup EXE above. The MSI is also available on the [releases page](https://github.com/PavelCRG/FlickVert/releases/latest). To run without installing, download the Portable ZIP and open `FlickVert.exe` inside it. Windows may show a SmartScreen warning because the installer is not Authenticode-signed.

To install the latest Windows release from PowerShell, run:

```powershell
$installer = Join-Path $env:TEMP 'FlickVert-Setup.exe'; Invoke-WebRequest 'https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Setup.exe' -OutFile $installer; Start-Process $installer -Wait; Remove-Item $installer
```

Windows requires the Microsoft Edge WebView2 Runtime. Optional conversion engines are installed separately.

Current release: `0.1.5`.

After installing a release that includes the updater, FlickVert checks for signed updates at startup and every six hours while running. Use **Updates** in the sidebar to check again and install an available update. On Windows, the app selects the matching EXE or MSI update automatically. The portable build must be updated manually from GitHub Releases.

## Quick start

1. Start FlickVert. Home opens on every launch. Open **Quick start** from the sidebar or **Show quick start** in Settings for the guide.
2. Drag a file, press **Shift**, and drop it onto a format in the wheel beside the pointer.
3. Find the converted file beside the original. Use Home to browse supported formats and Settings to customize the app.

## Closing the app

Closing the main window hides FlickVert to the system tray. The drag wheel and global shortcut keep working in the background. Choose **Quit** from the tray menu to exit FlickVert completely.

The default shortcut, **Ctrl+Alt+Space**, opens quick actions for files selected in File Explorer. You can also drop a file onto the wheel. Use **1/2/3** to switch modes, arrow keys to select a target, and **Enter** to run it. **Esc** closes the wheel. Change the shortcut in **Settings**.

While dragging, press **Ctrl** for tools or **Alt** for file actions. The tools wheel can resize, rotate, flip, grayscale, square-crop, compress, remove image metadata, or combine up to 100 images into a PDF. HEIC, AVIF, TIFF, and SVG tools require ImageMagick; these save PNG or JPEG output. With FFmpeg installed, the wheel also offers video compression, mute, audio extraction, thumbnails, audio compression, and loudness normalization. Actions can create or safely extract ZIP archives, copy or move selected files and folders to `Downloads/FlickVert`, reveal one item in File Explorer, copy its path, or open its folder in PowerShell.

For detailed image work, choose **Edit image** in Tools. The editor can crop or redact a selected area, add a text annotation or background fill, and adjust brightness and contrast. It saves a new PNG beside the source and leaves the original unchanged.

## How the drag wheel works

1. Start dragging a selected file from File Explorer with the left mouse button.
2. Tap **Shift** for formats, **Ctrl** for tools, or **Alt** for file actions. The wheel stays open after releasing the key.
3. Move over a choice and release the mouse button to run it. Press **Esc** to cancel.

The wheel needs a file drag that starts in File Explorer. You can also open the wheel with the global shortcut and then drag a file onto it.

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

FlickVert currently supports Windows 10/11. The configured keyboard shortcut is an alternative for opening quick actions.

## Privacy

Files are processed on your device; FlickVert does not upload them or use analytics. Installed builds contact GitHub Releases to check for and download signed updates. Optional conversion engines run locally as separate programs.

## Languages

- [Русский](README.ru.md)
- [简体中文](README.zh-CN.md)
