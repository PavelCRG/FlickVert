# План: круговое меню FlickVert

1. `src-tauri/Cargo.toml`, новый Rust input module, `main.rs`: слушать Shift taps во время drag левой кнопки и посылать pointer position в Tauri; оставить глобальные события непрерываемыми. Не запускать UI из input thread.
2. `src-tauri/src/main.rs`, `src-tauri/src/operations.rs`: открыть QuickMenu без фокуса по событию; вернуть выходные форматы по входному расширению и текущим движкам; разрешать чтение только файла, ранее переданного через `inspect_dropped_files`.
3. `src/QuickMenu.tsx`, `src/quick-menu.css`, `src/i18n.ts`: получить drag/drop из Tauri Webview API, показать динамические сектора вокруг FV, вычислять активный сектор по physical drop coordinates и отправить конвертацию соответствующему движку.
4. `README.md`, `docs/research/sweetch-analysis.md`: описать жест, особенности разрешения macOS и границы реализации.
5. Проверить `npm run build` и `npm run tauri -- build --no-bundle --config tauri.build-test.json` без запуска тестов; удалить временный `.research/Sweetch`; проверить git diff/status.

Порядок важен: UI завязан на событие открытия из native input и на форматные списки Rust.
