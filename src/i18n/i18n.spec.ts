import { afterEach, describe, expect, it } from 'vitest'
import { countryName } from './countries'
import { detectLocale, getLocale, setLocale, subscribeLocale, t } from './i18n'
import { en } from './messages/en'
import { es } from './messages/es'

const leaves = (node: unknown, prefix = ''): string[] =>
  typeof node === 'string'
    ? [prefix]
    : Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key))

const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('i18n', () => {
  afterEach(() => setLocale('es'))

  it('el idioma guardado manda; si no, el del sistema; si no es ninguno conocido, inglés', () => {
    expect(detectLocale('en', ['es-ES'])).toBe('en')
    expect(detectLocale(null, ['es-AR', 'en'])).toBe('es')
    expect(detectLocale(null, ['de-DE', 'en-GB'])).toBe('en')
    expect(detectLocale('xx', ['fr-FR'])).toBe('en')
  })

  it('traduce, sustituye los parámetros y avisa a quien escucha', () => {
    let calls = 0
    const stop = subscribeLocale(() => calls++)
    expect(t('radio.bandAria', { band: '40m', freq: '7.074.000' })).toBe('Banda 40m, 7.074.000, clic para saltar')
    setLocale('en')
    expect(getLocale()).toBe('en')
    expect(t('radio.bandAria', { band: '40m', freq: '7.074.000' })).toBe('40m band, 7.074.000, click to jump')
    expect(calls).toBe(1)
    stop()
  })

  it('español e inglés tienen las mismas claves y los mismos parámetros', () => {
    expect(leaves(en).sort()).toEqual(leaves(es).sort())
    const lookup = (catalog: unknown, key: string) =>
      key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog) as string
    for (const key of leaves(es)) expect(params(lookup(en, key)), key).toEqual(params(lookup(es, key)))
  })

  it('los países salen en el idioma de la interfaz', () => {
    expect(countryName('Alemania')).toBe('Alemania')
    setLocale('en')
    expect(countryName('Alemania')).toBe('Germany')
    expect(countryName('Chile')).toBe('Chile')
  })
})
