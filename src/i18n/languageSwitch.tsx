import { LOCALES, LOCALE_NAMES, type Locale } from './i18n'
import { useI18n } from './useI18n'

// Selector de idioma de la cabecera. Se recuerda entre sesiones.
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()
  return (
    <select
      data-testid="language-select"
      aria-label={t('common.language')}
      title={t('common.language')}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
      className="h-7 rounded border border-line bg-tile px-1.5 py-0 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-slice"
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {code.toUpperCase()} · {LOCALE_NAMES[code]}
        </option>
      ))}
    </select>
  )
}
