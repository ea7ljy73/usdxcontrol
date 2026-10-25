import { describe, expect, it } from 'vitest'
import {
  clampFrequency,
  formatFrequency,
  formatFrequencyDigits,
  parseFrequencyDigits,
} from './frequency'

describe('frequency', () => {
  it('limita la frecuencia al rango sano del firmware (100 kHz .. 60 MHz)', () => {
    expect(clampFrequency(5_000)).toBe(100_000)
    expect(clampFrequency(70_000_000)).toBe(60_000_000)
    expect(clampFrequency(7_074_000.4)).toBe(7_074_000)
  })

  it('formatea a 11 dígitos para el comando FA', () => {
    expect(formatFrequencyDigits(7_074_000)).toBe('00007074000')
    expect(formatFrequencyDigits(60_000_000)).toBe('00060000000')
  })

  it('parsea la respuesta FA de la radio (FA00007074000;)', () => {
    expect(parseFrequencyDigits('00007074000')).toBe(7_074_000)
    expect(parseFrequencyDigits('')).toBe(100_000)
  })

  it('formatea la lectura de pantallas agrupada por miles', () => {
    expect(formatFrequency(7_074_000)).toBe('7.074.000')
    expect(formatFrequency(60_000_000)).toBe('60.000.000')
  })
})
