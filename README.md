<p align="center">
  <img src="public/fv-mark.svg" width="64" alt="FlickVert FV logo" />
</p>

<h1 align="center">FlickVert</h1>

<p align="center">A small, local file converter for Windows and macOS.</p>

<p align="center"><strong>Drag a file · Tap Shift · Drop on a format</strong></p>

<p align="center">A lightweight helper alongside File Explorer and Finder. Dropped files are converted locally and saved beside their originals.</p>

<p align="center"><a href="#english">English</a> · <a href="#русский">Русский</a> · <a href="#中文">中文</a></p>

---

## English

### Get started

1. Drag a file from File Explorer or Finder into FlickVert. In the app, you can also choose an image with **Browse**.
2. While holding the left mouse button, tap and release `Shift` to open the format wheel.
3. Move to a format and release the file. Press `Escape` to cancel.

Files dropped from File Explorer or Finder are saved in the same folder as the source. Images chosen with **Browse** are saved to `Downloads/FlickVert`, because the system picker does not provide their source path. FlickVert never replaces an existing file: if the name is taken, it adds a number such as `photo (2).webp`.

### What it converts

- **Images:** PNG, JPEG, WebP, GIF, and BMP to PNG, JPEG, or WebP.
- **Audio and video:** with FFmpeg installed.
- **Text documents and ebooks:** with Pandoc installed.
- **Office documents to PDF:** with LibreOffice installed.
- **Camera RAW images:** with ImageMagick installed.

Image conversion is built in. Other conversion engines are optional and installed separately. FlickVert processes files locally and does not upload them. Animated GIFs are converted from the first frame.

### Install from source

Prebuilt installers are not published yet. To run the development version, install Node.js 24, Rust stable, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), then run:

```sh
npm ci
npm run tauri dev
```

FlickVert supports Windows 10/11 and macOS 13 or later. On macOS, allow Accessibility/Input Monitoring for the global Shift-drag gesture; the keyboard shortcut `Control+Option+Space` is an alternative.

## Русский

### Быстрый старт

1. Перетащите файл из Проводника или Finder в FlickVert. В приложении также можно выбрать изображение кнопкой **Browse**.
2. Удерживая левую кнопку мыши, нажмите и отпустите `Shift`, чтобы открыть круговое меню.
3. Наведите указатель на формат и отпустите файл. Нажмите `Escape`, чтобы отменить действие.

Файлы, перетащенные из Проводника или Finder, сохраняются в той же папке, что и оригинал. Изображения, выбранные через **Browse**, сохраняются в `Загрузки/FlickVert`: системное окно выбора не передаёт приложению путь к исходной папке. FlickVert не заменяет существующие файлы: если имя занято, добавляется номер, например `photo (2).webp`.

### Поддерживаемые форматы

- **Изображения:** PNG, JPEG, WebP, GIF и BMP в PNG, JPEG или WebP.
- **Аудио и видео:** нужен установленный FFmpeg.
- **Текстовые документы и электронные книги:** нужен Pandoc.
- **Документы Office в PDF:** нужен LibreOffice.
- **RAW-фотографии:** нужен ImageMagick.

Конвертация изображений встроена. Остальные движки устанавливаются отдельно. Файлы обрабатываются на компьютере и не загружаются в интернет. Из анимированного GIF сохраняется первый кадр.

### Сборка из исходного кода

Готовые установщики пока не публикуются. Для запуска версии разработки установите Node.js 24, стабильный Rust и [зависимости Tauri](https://v2.tauri.app/start/prerequisites/), затем выполните:

```sh
npm ci
npm run tauri dev
```

Поддерживаются Windows 10/11 и macOS 13 или новее. Для жеста Shift-перетаскивания на macOS разрешите FlickVert доступ в «Универсальном доступе»/мониторинге ввода. Быстрый вызов меню: `Control+Option+Space`.

## 中文

### 快速开始

1. 从文件资源管理器或 Finder 将文件拖入 FlickVert。也可以在应用中通过 **Browse** 选择图片。
2. 按住鼠标左键拖动文件时，轻按并松开 `Shift` 打开格式环形菜单。
3. 将指针移到目标格式后松开文件。按 `Escape` 可取消。

从文件资源管理器或 Finder 拖入的文件会保存在源文件所在的文件夹中。通过 **Browse** 选择的图片会保存到 `Downloads/FlickVert`，因为系统文件选择器不会向应用提供源文件夹路径。FlickVert 不会覆盖已有文件；如果文件名已存在，会自动添加序号，例如 `photo (2).webp`。

### 支持的格式

- **图片：** PNG、JPEG、WebP、GIF 和 BMP，可转换为 PNG、JPEG 或 WebP。
- **音频和视频：** 需要安装 FFmpeg。
- **文本和电子书文档：** 需要安装 Pandoc。
- **Office 文档转 PDF：** 需要安装 LibreOffice。
- **相机 RAW 图片：** 需要安装 ImageMagick。

图片转换功能已内置，其他转换引擎需单独安装。文件仅在本机处理，不会上传。动画 GIF 只转换第一帧。

### 从源代码运行

目前尚未发布预编译安装包。运行开发版本前，请安装 Node.js 24、稳定版 Rust 以及 [Tauri 所需组件](https://v2.tauri.app/start/prerequisites/)，然后执行：

```sh
npm ci
npm run tauri dev
```

支持 Windows 10/11 和 macOS 13 或更高版本。在 macOS 上使用全局 Shift 拖放手势时，需要在系统设置中允许辅助功能 / 输入监控权限。也可以使用快捷键 `Control+Option+Space` 打开菜单。

---

Built with Tauri 2, Rust, React, TypeScript, and Vite. See [LICENSE](LICENSE) for licensing details.
