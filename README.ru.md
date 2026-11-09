<div align="center">
  <img src="public/fv-file-orange.png" width="96" alt="Логотип FlickVert" />
  <h1>FlickVert</h1>
  <p>Локальные инструменты для конвертации, редактирования и упорядочивания файлов в Windows.</p>
  <p>
    <a href="https://github.com/PavelCRG/FlickVert/releases/latest"><strong>Скачать для Windows</strong></a> ·
    <a href="https://github.com/PavelCRG/FlickVert/issues/new?template=bug_report.yml">Сообщить об ошибке</a> ·
    <a href="CONTRIBUTING.md">Как помочь проекту</a>
  </p>
  <p><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a></p>
  <a href="https://github.com/PavelCRG/FlickVert/actions/workflows/desktop-build.yml?query=branch%3Amain"><img src="https://github.com/PavelCRG/FlickVert/actions/workflows/desktop-build.yml/badge.svg?branch=main" alt="Статус сборки" /></a>
</div>

FlickVert помогает работать с файлами без загрузки в интернет. Перетащите файл, выберите действие в круговом меню и сохраните новый результат рядом с оригиналом или в выбранную папку.

## Скачать

В последнем релизе есть установщик Windows и портативный ZIP. Установленная версия проверяет подписанные обновления; портативную версию нужно обновлять вручную. Windows может показать SmartScreen: установщик не подписан сертификатом Authenticode. Требуются Windows 10/11 и Microsoft Edge WebView2 Runtime.

[Последний релиз и контрольные суммы](https://github.com/PavelCRG/FlickVert/releases/latest).

## Быстрый старт

1. Начните перетаскивать файл из Проводника и нажмите **Shift**, чтобы открыть меню конвертации.
2. Нажмите **Ctrl** для инструментов или **Alt** для действий с файлами. Наведите указатель на нужный пункт и отпустите кнопку мыши.
3. Нажмите **Ctrl+Alt+Space**, чтобы открыть быстрые действия для выбранных файлов. Нажмите **Esc**, чтобы закрыть меню.

В главном окне доступны каталог инструментов, настройки и краткое руководство. При закрытии окна FlickVert остаётся в системном трее; выберите там **Quit**, чтобы завершить приложение.

## Возможности

| Файлы | Примеры | Дополнительный движок |
| --- | --- | --- |
| Изображения | Конвертация PNG, JPEG, WebP, BMP, SVG, HEIC, TIFF, AVIF; изменение размера, поворот, обрезка, сжатие, удаление метаданных | ImageMagick для HEIC, TIFF, AVIF и RAW |
| PDF | Экспорт страниц в PNG/JPEG, извлечение текста, объединение, разделение, перестановка и поворот страниц | Poppler для экспорта, текста, объединения и разделения; qpdf для редактирования страниц |
| Аудио и видео | Конвертация и сжатие, обрезка видео, отключение звука, извлечение аудио, миниатюры, нормализация громкости | FFmpeg |
| Документы и книги | Конвертация поддерживаемых текстовых форматов, электронных книг и документов Office | Pandoc или LibreOffice; Poppler для экспорта страниц PDF |
| Таблицы и презентации | XLSX, ODS, CSV, PPT, PPTX и ODP | LibreOffice; Poppler для изображений слайдов |
| Архивы | Создание и распаковка ZIP, TAR и GZIP | Встроено |

Доступные действия зависят от выбранных файлов и установленных движков. FlickVert сообщает, когда для операции нужен дополнительный движок.

## Файлы и конфиденциальность

- По умолчанию результат сохраняется рядом с исходным файлом. При необходимости выберите другую папку в **Settings**.
- FlickVert не перезаписывает файлы: при совпадении имени добавляет номер.
- Файлы обрабатываются на устройстве. FlickVert не загружает их и не использует аналитику. Установленная версия обращается к GitHub Releases только для проверки и загрузки подписанных обновлений.

## Сообщить об ошибке

[Открыть сообщение об ошибке](https://github.com/PavelCRG/FlickVert/issues/new?template=bug_report.yml) или [предложить улучшение](https://github.com/PavelCRG/FlickVert/issues/new?template=feature_request.yml). Можно писать по-русски или по-английски. Укажите версию FlickVert, версию Windows и шаги для повторения ошибки. Не прикладывайте личные файлы и секреты.

## Разработка

Установите Node.js 24, стабильную версию Rust и [системные зависимости Tauri](https://v2.tauri.app/start/prerequisites/). Затем выполните:

~~~sh
npm ci
npm run dev
~~~

Основные проверки и сборка:

~~~sh
npm run check
npm test
npm run build
npm run test:rust
npm run tauri -- build
~~~

**npm run check** запускает frontend-тесты, сборку frontend и Rust-тесты. См. [инструкции для контрибьюторов](CONTRIBUTING.md) и [порядок выпуска релиза](docs/releasing.md).
