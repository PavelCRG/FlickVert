import type { Language } from './settings'

const messages = {
  'Convert files': ['Convert files', 'Конвертация файлов'], 'History': ['History', 'История'], 'Settings': ['Settings', 'Настройки'], 'Resize': ['Resize', 'Изменить размер'], 'Choose an action': ['Choose an action', 'Выберите действие'],
  'Workspace': ['Workspace', 'Рабочая область'], 'Your files stay here': ['Your files stay here', 'Файлы остаются на устройстве'],
  'Processed on this device': ['Processed on this device', 'Обработка на этом устройстве'], 'PRIVATE BY DESIGN': ['PRIVATE BY DESIGN', 'КОНФИДЕНЦИАЛЬНОСТЬ'],
  'File conversion': ['File conversion', 'Конвертация файлов'], 'Add images, choose a format and save the result.': ['Add images, choose a format and save the result.', 'Добавьте изображения, выберите формат и сохраните результат.'],
  'Images · PNG, JPEG, WebP': ['Images · PNG, JPEG, WebP', 'Изображения · PNG, JPEG, WebP'], 'Drop files here': ['Drop files here', 'Перетащите файлы сюда'],
  'or': ['or', 'или'], 'browse your computer': ['browse your computer', 'выберите на компьютере'],
  'Files are processed on your device and never uploaded': ['Files are processed on your device and never uploaded', 'Файлы обрабатываются на устройстве и никуда не отправляются'],
  'File queue': ['File queue', 'Очередь файлов'], 'Clear queue': ['Clear queue', 'Очистить очередь'], 'Your files will appear here': ['Your files will appear here', 'Здесь появятся файлы'],
  'Add one or more files to get started': ['Add one or more files to get started', 'Добавьте файлы, чтобы начать'], 'Ready to convert': ['Ready to convert', 'Готово к конвертации'],
  'Format not supported': ['Format not supported', 'Формат не поддерживается'], 'Could not convert': ['Could not convert', 'Не удалось конвертировать'],
  'Output settings': ['Output settings', 'Параметры результата'], 'These settings apply to every image in the queue.': ['These settings apply to every image in the queue.', 'Параметры применяются ко всем изображениям в очереди.'],
  'FORMAT': ['FORMAT', 'ФОРМАТ'], 'Convert to': ['Convert to', 'Формат'], 'Quality': ['Quality', 'Качество'], 'Lossless': ['Lossless', 'Без потерь'],
  'Save location': ['Save location', 'Папка сохранения'], 'Downloads / FlickVert': ['Downloads / FlickVert', 'Загрузки / FlickVert'],
  'Add images to get started': ['Add images to get started', 'Добавьте изображения'], 'No supported images in the queue': ['No supported images in the queue', 'Нет изображений для конвертации'],
  'image': ['image', 'изображение'], 'images': ['images', 'изображений'], 'Converting...': ['Converting...', 'Конвертация...'], 'Done': ['Done', 'Готово'], 'Convert': ['Convert', 'Конвертировать'],
  'RECENT WORK': ['RECENT WORK', 'НЕДАВНИЕ ФАЙЛЫ'], 'Conversions completed during this session.': ['Conversions completed during this session.', 'Завершённые конвертации за этот сеанс.'],
  'No completed conversions yet': ['No completed conversions yet', 'Пока нет завершённых конвертаций'], 'Converted files will appear here until you close FlickVert': ['Converted files will appear here until you close FlickVert', 'Здесь будут файлы до закрытия FlickVert'],
  'Converted': ['Converted', 'Готово'], 'Back to conversion': ['Back to conversion', 'Назад к конвертации'], 'MAKE IT YOURS': ['MAKE IT YOURS', 'ПЕРСОНАЛЬНЫЕ НАСТРОЙКИ'],
  'Choose how FlickVert looks.': ['Choose how FlickVert looks.', 'Настройте внешний вид FlickVert.'], 'Appearance': ['Appearance', 'Оформление'], 'System': ['System', 'Системное'], 'Light': ['Light', 'Светлое'], 'Dark': ['Dark', 'Тёмное'],
  'Language': ['Language', 'Язык'], 'English': ['English', 'Английский'], 'Russian': ['Russian', 'Русский'], 'System appearance': ['System appearance', 'Как в системе'],
  'Max width': ['Max width', 'Макс. ширина'], 'Max height': ['Max height', 'Макс. высота'], 'Animated GIFs are converted using the first frame.': ['Animated GIFs are converted using the first frame.', 'Анимированные GIF преобразуются только по первому кадру.'],
  'Image': ['Image', 'Изображение'], 'Video': ['Video', 'Видео'], 'Audio': ['Audio', 'Аудио'], 'PDF document': ['PDF document', 'Документ PDF'], 'File': ['File', 'Файл'],
  'Quick shortcut': ['Quick shortcut', 'Быстрый вызов'], 'Shortcut unavailable. Use the tray menu.': ['Shortcut unavailable. Use the tray menu.', 'Сочетание недоступно. Используйте меню в области уведомлений.'],
  'FFmpeg unavailable': ['FFmpeg unavailable', 'FFmpeg не найден'], 'Pandoc unavailable': ['Pandoc unavailable', 'Pandoc не найден'], 'ImageMagick unavailable': ['ImageMagick unavailable', 'ImageMagick не найден'], 'LibreOffice unavailable': ['LibreOffice unavailable', 'LibreOffice не найден'], 'Conversion engines': ['Conversion engines', 'Модули конвертации'], 'Detected': ['Detected', 'Найден'], 'Not detected on PATH': ['Not detected on PATH', 'Не найден в PATH'], 'Document format': ['Document format', 'Формат документа'], 'Document': ['Document', 'Документ'], 'Drop media from Finder or Explorer': ['Drop media from Finder or Explorer', 'Перетащите файл из Finder или Проводника'],
  'Video format': ['Video format', 'Формат видео'], 'Audio format': ['Audio format', 'Формат аудио'], 'item': ['item', 'файл'], 'items': ['items', 'файлов'],
  'Browse images or drop audio and video from Finder or Explorer.': ['Browse images or drop audio and video from Finder or Explorer.', 'Выбирайте изображения или перетащите аудио и видео из Finder/Проводника.'],
  'Drop files to add them': ['Drop files to add them', 'Перетащите файлы сюда'], 'Your files stay on this device. Processing runs locally.': ['Your files stay on this device. Processing runs locally.', 'Файлы остаются на устройстве. Обработка выполняется локально.'],
} as const

export type MessageKey = keyof typeof messages
export function t(language: Language, key: MessageKey): string { return messages[key][language === 'ru' ? 1 : 0] }
