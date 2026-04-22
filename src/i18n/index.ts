/**
 * Vue I18n configuration.
 * Initializes the i18n instance with English (default) and Chinese locales.
 * Auto-detects browser language; falls back to English.
 */
import { createI18n } from 'vue-i18n'
import en from './locales/en'
import zh from './locales/zh'

function detectLocale(): string {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem('codex-web-local.language.v1')
    if (saved === 'en' || saved === 'zh') return saved
  }
  if (typeof navigator === 'undefined') return 'en'
  const lang = navigator.language || ''
  if (lang.startsWith('zh')) return 'zh'
  return 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    zh,
  },
})

export default i18n
