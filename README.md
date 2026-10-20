<p align="center">
  <img src="public/fv-mark.svg" width="30" alt="FlickVert FV monogram" />
</p>

<h1 align="center">FlickVert</h1>

<p align="center">A small, local-first file utility for Windows and macOS.</p>

<p align="center"><strong>Windows 10/11 · macOS 13+</strong> &nbsp;|&nbsp; Tauri 2 · Rust · React · TypeScript</p>

---

## Features

- Convert PNG, JPEG, WebP, GIF, and BMP images to PNG, JPEG, or WebP.
- Resize images to fit a maximum width and height while preserving their aspect ratio and avoiding upscaling.
- Convert audio and video when FFmpeg is installed and the source is dropped directly from Finder or File Explorer into FlickVert.
- Keep files on the device. Outputs go to `Downloads/FlickVert`; an existing output is kept and the new file gets a numbered name.
- Use Russian or English, and follow the system's light/dark appearance or choose one explicitly.
- Open the tray/menu-bar menu or quick action wheel with `Ctrl+Alt+Space` (Control+Option+Space on macOS).

### Format notes

- Animated GIF input is converted from its first frame; animation is not preserved.
- Transparent areas are filled with white when converting to JPEG.
- Audio/video conversion uses an FFmpeg executable already available on `PATH`. FlickVert does not download tools.
- PDF/Office, RAW camera, archive, and subtitle conversion are not implemented yet. Unsupported files remain unchanged.

## Build and run

Install Node.js 24 and Rust stable. Follow the current [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for WebView2 and the Windows or macOS build tools.

```sh
npm ci
npm run tauri dev
```

Build an unsigned package for the current operating system:

```sh
npm run tauri build
```

## Checks

```sh
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

GitHub Actions builds Windows x64 and macOS Intel/Apple Silicon packages without signing or publishing them.

## Project layout

```text
src/          React interface, settings, image conversion, quick menu
src-tauri/    Tauri shell, Rust file safety and optional FFmpeg processing
public/       FlickVert identity assets
```

## Stack

- **Tauri 2 + Rust** — native windows, tray/menu bar, shortcuts, and safe output handling.
- **React + TypeScript + Vite** — shared Windows/macOS interface.
- **Canvas API** — local image decoding, resizing, and export.
- **FFmpeg** — optional local audio/video conversion when installed by the user.
