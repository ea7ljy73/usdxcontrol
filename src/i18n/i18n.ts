import { en } from './messages/en.js'
import { es, type Messages } from './messages/es.js'

// Idioma de la interfaz. El español es el catálogo de referencia: cada clave de `es` debe
// existir en `en` (lo comprueba el compilador) y `t` solo acepta claves que existen.
export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const LOCALE_NAMES: Record<Locale, string> = { es: 'Español', en: 'English' }

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]
export type MessageKey = Leaves<Messages>
export type MessageParams = Record<string, string | number>

const CATALOGS: Record<Locale, Messages> = { es, en }
const STORAGE_KEY = 'ui.locale'

const isLocale = (value: unknown): value is Locale => typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

// Lo elegido en la app manda; si no hay nada, el idioma del sistema (español o, si no, inglés).
export function detectLocale(stored: string | null, languages: readonly string[]): Locale {
  if (isLocale(stored)) return stored
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return 'en'
}

// Se usa también en el proceso principal de Electron (Node), donde no hay DOM ni almacenamiento.
type Env = {
  localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void }
  navigator?: { language?: string; languages?: readonly string[] }
  document?: { documentElement: { lang: string } }
}
const env = globalThis as Env

const readStored = () => {
  try {
    return env.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

const systemLanguages = (): readonly string[] => {
  const nav = env.navigator
  if (nav?.languages?.length) return nav.languages
  return nav?.language ? [nav.language] : []
}

let current: Locale = detectLocale(readStored(), systemLanguages())
const listeners = new Set<() => void>()

const applyDocumentLang = () => {
  if (env.document) env.document.documentElement.lang = current
}
applyDocumentLang()

export const getLocale = (): Locale => current

export function setLocale(locale: Locale) {
  if (locale === current) return
  current = locale
  try {
    env.localStorage?.setItem(STORAGE_KEY, locale)
  } catch {
    // sin almacenamiento: el idioma dura lo que la sesión
  }
  applyDocumentLang()
  for (const listener of listeners) listener()
}

export function subscribeLocale(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const lookup = (catalog: Messages, key: string): string | undefined => {
  let node: unknown = catalog
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

// Texto de la clave en el idioma actual, con {nombre} sustituido por params.nombre.
export function t(key: MessageKey, params?: MessageParams): string {
  const text = lookup(CATALOGS[current], key) ?? lookup(es, key) ?? key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}
