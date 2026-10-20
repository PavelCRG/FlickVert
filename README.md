<p align="center">
  <img src="public/fv-mark.svg" width="72" alt="FlickVert FV monogram" />
</p>

<h1 align="center">FlickVert</h1>

<p align="center">A small desktop app for converting images on your device.</p>

<p align="center"><strong>Windows · macOS</strong> &nbsp;|&nbsp; Tauri 2 · React · TypeScript</p>

---

FlickVert converts common image files without uploading them to a server. Add files by dropping them into the window or choosing them from your computer.

## What it can do

- Convert PNG, JPEG, WebP, GIF and BMP images to PNG, JPEG or WebP.
- Adjust output quality for JPEG and WebP; PNG stays lossless.
- Convert multiple images in one batch.
- Review completed conversions in the session history.
- Switch between light and dark themes.
- Keep image processing on the device; converted files use the system's default download behavior.

### Format notes

- Animated GIFs are converted from their first frame.
- Transparent areas are filled with white when converting to JPEG.
- Other file types can appear in the queue, but are not converted.

## Run locally

### Requirements

- Node.js LTS and Rust stable.
- **Windows:** Microsoft C++ Build Tools with *Desktop development with C++*, plus WebView2.
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).

See the [official Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for current setup details.

### Development

Run these commands from the repository folder:

```sh
npm install
npm run tauri dev
```

Create a production build for the current operating system:

```sh
npm run tauri build
```

Windows and macOS installers must be built on their respective operating systems.

## Project layout

```text
public/       App icon and static assets
src/          React interface and styles
src-tauri/    Tauri and Rust desktop shell
```

## Stack

- **Tauri 2 + Rust** — native desktop window and packaging.
- **React + TypeScript + Vite** — app interface and development server.
- **Canvas API** — local image decoding and export.
