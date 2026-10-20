# FlickVert

![FlickVert FV mark](public/fv-mark.svg)

A cross-platform desktop image converter for Windows and macOS.

## Stack

- **Tauri 2 + Rust** for the native desktop shell and platform installers.
- **React + TypeScript + Vite** for one shared interface across both platforms.
- **Canvas API** for local PNG, JPEG, WebP, GIF and BMP conversion to PNG, JPEG or WebP.

Image processing stays on the device. Other file types are identified in the queue but are not converted yet. Animated GIFs are converted as a single frame; transparent pixels are filled with white when exporting to JPEG.

## Run

Install Node.js, Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). On Windows this includes Microsoft C++ Build Tools and WebView2. On macOS it includes Xcode Command Line Tools.

```sh
npm install
npm run tauri dev
```

Build a release for the current operating system:

```sh
npm run tauri build
```

Build Windows and macOS packages on their respective operating systems. Tauri uses the platform's supported bundle formats.
