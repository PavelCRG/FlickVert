<div align="center">
  <img src="public/fv-mark.svg" width="72" height="48" alt="FlickVert FV 标志" />
  <h1>FlickVert</h1>
  <p>适用于 Windows 和 macOS 的本地文件转换工具。</p>
  <p>
    <a href="#快速开始"><img alt="快速开始" src="https://img.shields.io/badge/%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B-%E6%8B%96%E6%94%BE%E5%B9%B6%E8%BD%AC%E6%8D%A2-E8783D?style=for-the-badge"></a>
    <a href="#支持的格式"><img alt="支持的格式" src="https://img.shields.io/badge/%E6%A0%BC%E5%BC%8F-%E6%9F%A5%E7%9C%8B%E6%94%AF%E6%8C%81%E6%83%85%E5%86%B5-59616D?style=for-the-badge"></a>
    <a href="#从源码构建"><img alt="从源码构建" src="https://img.shields.io/badge/%E6%9E%84%E5%BB%BA-%E4%BB%8E%E6%BA%90%E7%A0%81-59616D?style=for-the-badge"></a>
  </p>
  <p><a href="README.md">English</a> · <a href="README.ru.md">Русский</a></p>
</div>

FlickVert 可与文件资源管理器和 Finder 配合使用。将文件拖入应用，选择格式，然后在本机保存转换结果。

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

1. 打开 FlickVert，将一个或多个文件拖入窗口，或点击 **Browse** 选择图片。
2. 选择输出格式并开始转换。
3. 转换后的文件保存在原文件旁边。通过 **Browse** 选择的图片会保存到 `Downloads/FlickVert`。

## 重新打开应用

关闭窗口后，FlickVert 会继续在系统托盘中运行，以便拖放转盘和快捷键继续可用。点击托盘图标并选择 **Show FlickVert** 可重新打开窗口。选择 **Quit** 可完全退出应用。

默认快捷键为 **Ctrl+Alt+Space**，用于打开快捷操作菜单。可在 **Settings** 中更改。

拖动文件时，按下并松开 **Ctrl**（Windows）或 **Command**（macOS）可打开工具菜单；按下并松开 **Alt/Option** 可打开文件操作菜单。图像工具支持缩放、旋转、翻转、灰度、正方形裁剪和压缩。安装 FFmpeg 后，还可压缩视频、静音、提取音频、生成缩略图、压缩音频和标准化响度。将文件拖到选项上并松开鼠标即可执行；处理结果会以新文件名保存在原文件旁边。操作菜单还可将所选文件复制到 `Downloads/FlickVert`、移动单个文件、在资源管理器/Finder 中定位文件或复制路径。

## 拖放转盘

1. 按住鼠标左键，从文件资源管理器或 Finder 开始拖动文件。
2. 按住鼠标时，按下并松开 **Shift**。格式转盘会在指针附近打开。
3. 将指针移到格式上并松开鼠标。按 **Esc** 可取消。

此手势需要从文件资源管理器或 Finder 开始拖动文件。通过 **Browse** 选择文件不会触发转盘。

## 支持的格式

| 文件类型 | 格式 | 说明 |
| --- | --- | --- |
| 图片 | PNG、JPEG、WebP | 内置转换；可使用 GIF 和 BMP 作为输入。动画 GIF 仅转换第一帧。 |
| 音频和视频 | 取决于 FFmpeg | 需要单独安装 FFmpeg。 |
| 字幕 | SRT、VTT、ASS | 需要 FFmpeg，可在这些字幕格式之间转换。 |
| 文本文档和电子书 | 取决于 Pandoc | 需要单独安装 Pandoc。 |
| Office 文档转 PDF | 取决于 LibreOffice | 需要单独安装 LibreOffice。 |
| 相机 RAW 图片 | 取决于 ImageMagick | 需要单独安装 ImageMagick。 |

## 文件保存位置

- 从文件资源管理器或 Finder 拖入的文件会保存在原文件旁边。
- 通过 **Browse** 选择的图片会保存到 `Downloads/FlickVert`。
- FlickVert 不会覆盖已有文件；如果文件名已存在，会添加编号，例如 `photo (2).webp`。

## 从源码构建

安装 Node.js 24、稳定版 Rust 和 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)，然后运行：

```sh
npm ci
npm run tauri dev
```

支持 Windows 10/11 和 macOS 13 或更高版本。在 macOS 上，若要使用 Shift 拖放转盘，请允许 FlickVert 使用辅助功能和输入监控权限。也可以使用已配置的快捷键打开快捷菜单。

## 隐私

文件仅在本机处理，不会上传。可选转换引擎也在本机运行。

## 语言

- [English](README.md)
- [Русский](README.ru.md)
