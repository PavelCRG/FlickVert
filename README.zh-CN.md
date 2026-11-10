<div align="center">
  <img src="public/fv-file-orange.png" width="96" alt="FlickVert 标志" />
  <h1>FlickVert</h1>
  <p>适用于 Windows 的本地文件转换、编辑和整理工具。</p>
  <p>
    <a href="https://github.com/PavelCRG/FlickVert/releases/latest"><strong>下载 Windows 版本</strong></a> ·
    <a href="https://github.com/PavelCRG/FlickVert/issues/new?template=bug_report.yml">报告问题</a> ·
    <a href="CONTRIBUTING.md">参与项目</a>
  </p>
  <p><a href="README.md">English</a> · <a href="README.ru.md">Русский</a></p>
  <a href="https://github.com/PavelCRG/FlickVert/actions/workflows/desktop-build.yml?query=branch%3Amain"><img src="https://github.com/PavelCRG/FlickVert/actions/workflows/desktop-build.yml/badge.svg?branch=main" alt="桌面构建状态" /></a>
</div>

FlickVert 在本机处理文件，无需上传。拖动文件，选择操作，然后将结果保存到原文件旁边或指定文件夹。

## 下载

最新版本提供 Windows 安装程序和便携 ZIP。Setup 可选择安装目录，无需管理员权限。便携 ZIP 可解压到任何可写磁盘，需手动更新。应用设置保存在 Windows 用户配置文件中。由于安装程序尚未使用 Authenticode 证书签名，Windows 可能显示 SmartScreen 警告。需要 Windows 10/11 和 Microsoft Edge WebView2 Runtime。

[查看最新版本和校验和](https://github.com/PavelCRG/FlickVert/releases/latest)。

[验证下载文件和构建来源](docs/download-verification.md)。

## 快速开始

1. 从文件资源管理器拖动文件并按 **Shift**，打开格式转盘。
2. 按 **Ctrl** 打开工具，按 **Alt** 打开文件操作。将指针移到目标上并松开鼠标按钮即可执行。
3. 按 **Ctrl+Alt+Space** 为选中的文件打开快捷操作菜单。按 **Esc** 关闭转盘。

主窗口提供工具目录、设置和快速入门指南。关闭窗口后，FlickVert 会留在系统托盘中；选择 **Quit** 可退出应用。

## 功能

FlickVert 仅显示应用内部已实现的操作，不会查找或启动独立的转换程序。

| 文件 | 内置操作 |
| --- | --- |
| 图片 | 转换常见栅格格式和 SVG；调整大小、旋转、裁剪、压缩、移除元数据，以及从图片创建 PDF |
| PDF | 提取可选中文本；合并、拆分、排序和旋转页面 |
| 文档 | 转换 Markdown、HTML 和文本；从 RTF、DOCX、ODT 和 EPUB 提取文本 |
| 表格 | 转换 CSV 和 TSV；将单工作表 XLSX 转为 CSV/TSV，并将 TSV 转为 XLSX |
| 字幕 | 转换 SRT 和 VTT |
| 压缩包 | 创建和解压 ZIP、TAR、TAR.GZ、TGZ 和 GZIP |

尚未在应用内实现的格式不会显示。FlickVert 使用第三方 Rust 库；这些库的代码仍受各自许可证约束，不属于 FlickVert 原创代码。

## 文件和隐私

- 默认将结果保存到原文件旁边。也可以在 **Settings** 中选择其他文件夹。
- FlickVert 不会覆盖已有文件；遇到同名文件时会自动添加编号。
- 所有文件都在本机处理。FlickVert 不会上传文件，也不使用分析服务。已安装版本仅连接 GitHub Releases 检查并下载签名更新。

## 报告问题

[报告软件问题](https://github.com/PavelCRG/FlickVert/issues/new?template=bug_report.yml)或[提出功能建议](https://github.com/PavelCRG/FlickVert/issues/new?template=feature_request.yml)。欢迎使用英文或俄文。请注明 FlickVert 和 Windows 版本，以及复现步骤。请勿附上私人文件或机密信息。

## 开发

安装 Node.js 24、稳定版 Rust 和 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)，然后运行：

~~~sh
npm ci
npm run dev
~~~

常用检查和构建命令：

~~~sh
npm run check
npm test
npm run build
npm run test:rust
npm run tauri -- build
~~~

**npm run check** 会运行前端测试、前端构建和 Rust 测试。开发流程请参阅[贡献指南](CONTRIBUTING.md)，版本发布请参阅[发布说明](docs/releasing.md)。
