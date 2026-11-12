import { useSyncExternalStore } from 'react'
import { getLocale, setLocale, subscribeLocale, t } from './i18n'

// Los componentes que muestran texto usan este hook para repintarse al cambiar de idioma.
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale)
  return { locale, setLocale, t }
}
