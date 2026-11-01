import test from 'node:test'
import assert from 'node:assert/strict'
import { t, type MessageKey } from './i18n.ts'

test('theme labels are translated in English, Russian, and Simplified Chinese', () => {
  const expected = {
    'Accent color': ['Accent color', 'Акцентный цвет', '强调色'],
    Blue: ['Blue', 'Синий', '蓝色'],
    Violet: ['Violet', 'Фиолетовый', '紫色'],
    Teal: ['Teal', 'Бирюзовый', '青绿色'],
    Green: ['Green', 'Зелёный', '绿色'],
    Rose: ['Rose', 'Розовый', '玫瑰色'],
  } as const

  for (const [key, labels] of Object.entries(expected)) {
    assert.equal(t('en', key as MessageKey), labels[0])
    assert.equal(t('ru', key as MessageKey), labels[1])
    assert.equal(t('zh', key as MessageKey), labels[2])
  }
})
