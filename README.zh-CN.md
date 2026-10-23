<div align="center">
  <img src="public/fv-mark.svg" width="72" height="48" alt="FlickVert FV 标志" />
  <h1>FlickVert</h1>
  <p>适用于 Windows 和 macOS 的本地文件转换工具。</p>
  <p>
    <a href="#快速开始"><img alt="快速开始" src="https://img.shields.io/badge/%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B-%E6%8B%96%E6%94%BE%E5%B9%B6%E8%BD%AC%E6%8D%A2-285FE8?style=for-the-badge"></a>
    <a href="#支持的格式"><img alt="支持的格式" src="https://img.shields.io/badge/%E6%A0%BC%E5%BC%8F-%E6%9F%A5%E7%9C%8B%E6%94%AF%E6%8C%81%E6%83%85%E5%86%B5-59616D?style=for-the-badge"></a>
    <a href="#从源码构建"><img alt="从源码构建" src="https://img.shields.io/badge/%E6%9E%84%E5%BB%BA-%E4%BB%8E%E6%BA%90%E7%A0%81-59616D?style=for-the-badge"></a>
  </p>
  <p><a href="README.md">English</a> · <a href="README.ru.md">Русский</a></p>
</div>
<p>在 <strong>Tools → Edit image</strong> 中可以裁剪图片、涂黑区域、添加注释或背景，并调整亮度和对比度。结果以 PNG 格式保存在原图旁边。</p>

FlickVert 可与文件资源管理器和 Finder 配合使用。开始拖动文件后，指针旁会立即出现圆形菜单。将文件放到格式或操作上即可执行。主窗口包含历史记录和设置。

<p align="center"><a href="https://github.com/PavelCRG/FlickVert/releases/latest"><strong>下载适用于 Windows 或 macOS 的 FlickVert →</strong></a></p>

## 目录

- [快速开始](#快速开始)
- [重新打开应用](#重新打开应用)
- [拖放转盘](#拖放转盘)
- [支持的格式](#支持的格式)
- [文件保存位置](#文件保存位置)
- [从源码构建](#从源码构建)
- [隐私](#隐私)

## 快速开始

1. 启动 FlickVert。紧凑的设置窗口会打开；关闭窗口后，FlickVert 留在系统托盘中，你可以继续在资源管理器或 Finder 中工作。
2. 拖动文件并将其放到指针旁转盘中的目标格式上。
3. 转换后的文件保存在原文件旁边。从托盘打开主窗口即可查看历史记录或更改设置。

## 重新打开应用

关闭窗口后，FlickVert 会继续在系统托盘中运行，以便拖放转盘和快捷键继续可用。点击托盘图标并选择 **Show FlickVert** 可重新打开窗口。选择 **Quit** 可完全退出应用。

默认快捷键为 **Ctrl+Alt+Space**，用于为资源管理器或 Finder 中选中的文件打开快捷操作菜单。可在 **Settings** 中更改，也可以把文件拖到转盘上。按 **1/2/3** 切换模式，用方向键选择目标，再按 **Enter** 执行。按 **Esc** 关闭转盘。

拖动文件时，按下 **Ctrl**（Windows）或 **Command**（macOS）可打开工具菜单；按下 **Alt/Option** 可打开文件操作菜单。图像工具支持缩放、旋转、翻转、灰度、正方形裁剪、压缩，并可将最多 100 张图像合并为 PDF。安装 FFmpeg 后，还可压缩视频、静音、提取音频、生成缩略图、压缩音频和标准化响度。还可创建 ZIP 压缩包，或将其安全解压到新文件夹。操作菜单也可将所选文件和文件夹复制或移动到 `Downloads/FlickVert`、在资源管理器/Finder 中定位项目、复制路径或在终端中打开所在文件夹。

## 拖放转盘

1. 按住鼠标左键，从文件资源管理器或 Finder 开始拖动文件。
2. 开始拖动时转盘会立即打开。按住 **Ctrl**（Windows）或 **Command**（macOS）切换到工具，按住 **Alt/Option** 切换到文件操作。
3. 将指针移到目标上并松开鼠标按钮即可执行。按 **Esc** 可取消。

此手势需要从文件资源管理器或 Finder 开始拖动文件。也可以使用全局快捷键打开转盘，然后把文件拖到转盘上。

## 支持的格式

| 文件类型 | 格式 | 说明 |
| --- | --- | --- |
| 其他图像 | HEIC、TIFF、AVIF、SVG、相机 RAW | 需要 ImageMagick。 |
| 图片 | PNG、JPEG、WebP、BMP、HEIC、TIFF、AVIF、PDF | 常见图像输出为 PNG/JPEG/WebP/PDF 时无需外部工具；其他格式及 HEIC/TIFF/AVIF/SVG/RAW 输入需要 ImageMagick。内置 GIF 转换仅使用首帧。 |
| 音频和视频 | 取决于 FFmpeg | 需要单独安装 FFmpeg。 |
| 字幕 | SRT、VTT、ASS | 需要 FFmpeg，可在这些字幕格式之间转换。 |
| 文本文档和电子书 | 取决于 Pandoc | 需要单独安装 Pandoc。 |
| Office 文档转 PDF | 取决于 LibreOffice | 需要单独安装 LibreOffice。 |
| 电子表格 | XLSX、ODS、CSV | LibreOffice 可在这些格式之间转换；XLS 仅支持输入。 |
| 幻灯片 | PPT/PPTX/ODP 转 PDF、PNG、JPEG | 需要 LibreOffice；PNG/JPEG 还需要 Poppler，所有幻灯片保存到新文件夹。 |
| PDF 输入 | PNG、JPEG、TXT、Markdown；安装 Pandoc 后支持 DOCX 和 EPUB | 需要安装 Poppler。所有页面以 300 DPI 图像保存到新文件夹。文本输出需要可选中文本，无法保留原 PDF 排版。 |
| 相机 RAW 图片 | 取决于 ImageMagick | 需要单独安装 ImageMagick。 |
| 压缩包 | 创建和解压 ZIP | 可将文件夹打包；结果保存在所选文件旁边；会拒绝不安全路径和链接。 |

**尚未实现：** 扫描版 PDF 的 OCR、PDF 转 PAGES/PPTX/XLSX、区域遮盖与注释及背景编辑、TAR/GZIP/RAR、交互式媒体裁剪/拆分/合并。快捷键本身不会读取资源管理器或 Finder 中的选中项目。

## 文件保存位置

- 从文件资源管理器或 Finder 拖入的文件会保存在原文件旁边。
- FlickVert 不会覆盖已有文件；如果文件名已存在，会添加编号，例如 `photo (2).webp`。

## 从源码构建

安装 Node.js 24、稳定版 Rust 和 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)，然后运行：

```sh
npm ci
npm run dev
```

支持 Windows 10/11 和 macOS 13 或更高版本。在 macOS 上，若要使用拖放转盘，请允许 FlickVert 使用辅助功能和输入监控权限。也可以使用已配置的快捷键打开快捷菜单。

## 隐私

文件仅在本机处理，不会上传。可选转换引擎也在本机运行。

## 语言

- [English](README.md)
- [Русский](README.ru.md)
