<img align="left" src="public/fv-file-orange.png" width="120" alt="FlickVert logo" />

# FlickVert

文件操作，一步完成。本地转换、编辑和整理，适用于 Windows。

<br clear="left" />
<div align="center">
  <p><a href="README.md">English</a> · <a href="README.ru.md">Русский</a></p>
</div>

拖动文件。按 Shift。选择格式。

<p align="center">
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Setup.exe"><strong>下载 Windows 安装版</strong></a> ·
  <a href="https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Portable.zip">便携版 ZIP</a>
</p>

## 下载和安装

在 **Windows 10/11 x64** 上点击页面顶部的 EXE 安装包并打开下载文件。页面也提供 MSI 和便携 ZIP。便携版解压后运行 `FlickVert.exe` 即可。

安装程序允许选择安装目录。也可以在 PowerShell 中安装：

```powershell
$installer = Join-Path $env:TEMP 'FlickVert-Setup.exe'; Invoke-WebRequest 'https://github.com/PavelCRG/FlickVert/releases/latest/download/FlickVert-Windows-x64-Setup.exe' -OutFile $installer; Start-Process $installer -Wait; Remove-Item $installer
```

由于安装程序尚未使用 Authenticode 证书签名，Windows 可能会显示 SmartScreen 警告。

Windows 需要 Microsoft Edge WebView2 Runtime。其他转换引擎需单独安装。

当前版本、校验和及发行说明请查看[最新版本页面](https://github.com/PavelCRG/FlickVert/releases/latest)。安装版会在启动时及每六小时检查一次签名更新；Windows 安装版使用匹配的 EXE 或 MSI 更新。便携版需手动更新。Windows 安装包由 GitHub Actions 构建。

## 目录

- [下载和安装](#下载和安装)
- [快速开始](#快速开始)
- [退出应用](#退出应用)
- [拖放转盘](#拖放转盘)
- [支持的格式](#支持的格式)
- [文件保存位置](#文件保存位置)
- [从源码构建](#从源码构建)
- [隐私](#隐私)

## 快速开始

1. 启动 FlickVert。每次启动都会打开主页。可从侧边栏选择 **快速入门**，或在设置中点击 **显示快速入门** 查看指南。
2. 拖动文件并按 **Shift**，然后将其放到转盘中的目标格式上。
3. 转换后的文件保存在原文件旁边。在主窗口查看支持的格式并调整设置。

## 退出应用

关闭主窗口后，FlickVert 会隐藏到系统托盘。拖放转盘和全局快捷键仍可在后台使用。要完全退出 FlickVert，请在托盘菜单中选择 **Quit**。

默认快捷键为 **Ctrl+Alt+Space**，用于为资源管理器中选中的文件打开快捷操作菜单。可在 **Settings** 中更改，也可以把文件拖到转盘上。按 **1/2/3** 切换模式，用方向键选择目标，再按 **Enter** 执行。按 **Esc** 关闭转盘。

拖动文件时，按下 **Ctrl** 可打开工具菜单；按下 **Alt** 可打开文件操作菜单。图像工具支持缩放、旋转、翻转、灰度、正方形裁剪、压缩，并可将最多 100 张图像合并为 PDF。安装 FFmpeg 后，还可压缩视频、静音、提取音频、生成缩略图、压缩音频和标准化响度。还可创建 ZIP 压缩包，或将其安全解压到新文件夹。操作菜单也可将所选文件和文件夹复制或移动到 `Downloads/FlickVert`、在资源管理器中定位项目、复制路径或在终端中打开所在文件夹。

## 拖放转盘

1. 按住鼠标左键，从文件资源管理器开始拖动文件。
2. 拖动时按 **Shift** 打开格式转盘，按 **Ctrl**打开工具，按 **Alt**打开文件操作。松开按键后转盘保持打开。
3. 将指针移到目标上并松开鼠标按钮即可执行。按 **Esc** 可取消。

此手势需要从文件资源管理器开始拖动文件。也可以使用全局快捷键打开转盘，然后把文件拖到转盘上。

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

**尚不支持：** 扫描版 PDF 的 OCR、PDF 转 PAGES/PPTX/XLSX、TAR/GZIP/RAR。全局快捷键不会读取资源管理器中当前选中的文件；请从资源管理器拖动文件，或打开转盘后再将文件拖入。

## 文件保存位置

- 从文件资源管理器拖入的文件会保存在原文件旁边。
- FlickVert 不会覆盖已有文件；如果文件名已存在，会添加编号，例如 `photo (2).webp`。

## 从源码构建

安装 Node.js 24、稳定版 Rust 和 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)，然后运行：

```sh
npm ci
npm run dev
```

当前版本支持 Windows 10/11。也可以使用已配置的快捷键打开快捷菜单。

## 隐私

文件在本机处理；FlickVert 不会上传文件，也不使用分析服务。已安装版本会连接 GitHub Releases 检查并下载签名更新。可选转换引擎是独立程序，在本机运行。

## 语言

- [English](README.md)
- [Русский](README.ru.md)
