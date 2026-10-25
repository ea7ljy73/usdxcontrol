import { describe, expect, it } from 'vitest'
import { BANDS, bandFromFrequency } from './band'

describe('bandas HF', () => {
  it('definen rangos válidos y sin solapes', () => {
    expect(BANDS.length).toBe(9)
    for (const band of BANDS) {
      expect(band.fromHz).toBeLessThan(band.toHz)
      expect(band.defaultFreqHz).toBeGreaterThanOrEqual(band.fromHz)
      expect(band.defaultFreqHz).toBeLessThanOrEqual(band.toHz)
    }
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i].fromHz).toBeGreaterThan(BANDS[i - 1].toHz)
    }
  })

  it('resuelve la banda a partir de la frecuencia del VFO', () => {
    expect(bandFromFrequency(7_074_000)?.id).toBe('40m')
    expect(bandFromFrequency(14_100_000)?.id).toBe('20m')
    expect(bandFromFrequency(3_499_999)).toBeNull()
    expect(bandFromFrequency(29_700_000)?.id).toBe('10m')
  })
})
