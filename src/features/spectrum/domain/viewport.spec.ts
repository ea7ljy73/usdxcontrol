import { describe, expect, it } from 'vitest'
import { followViewCenter, spanOptions } from './viewport'

const BAND_40M = { fromHz: 7_000_000, toHz: 7_300_000 }

describe('viewport', () => {
  it('ofrece la banda completa y solo los zooms más estrechos que ella', () => {
    expect(spanOptions(BAND_40M).map((option) => option.label)).toEqual(['BAND', '100k', '25k', '6k'])
    expect(spanOptions({ fromHz: 10_100_000, toHz: 10_150_000 }).map((option) => option.label)).toEqual([
      'BAND',
      '25k',
      '6k',
    ])
    expect(spanOptions(null).map((option) => option.label)).toEqual(['50k', '12k', '4.8k'])
  })

  it('con la banda completa la vista no se mueve aunque cambie el dial', () => {
    const span = spanOptions(BAND_40M)[0].spanHz
    expect(followViewCenter({ vfoHz: 7_010_000, centerHz: null, spanHz: span, band: BAND_40M })).toBe(7_150_000)
    expect(followViewCenter({ vfoHz: 7_290_000, centerHz: 7_150_000, spanHz: span, band: BAND_40M })).toBe(7_150_000)
  })

  it('con zoom mantiene la vista mientras el dial no se acerque al borde', () => {
    const center = 7_100_000
    expect(followViewCenter({ vfoHz: 7_110_000, centerHz: center, spanHz: 25_000, band: BAND_40M })).toBe(center)
  })

  it('reencuadra centrando en el dial al acercarse al borde', () => {
    expect(followViewCenter({ vfoHz: 7_112_000, centerHz: 7_100_000, spanHz: 25_000, band: BAND_40M })).toBe(7_112_000)
  })

  it('no deja que la vista se salga de la banda', () => {
    const center = followViewCenter({ vfoHz: 7_001_000, centerHz: null, spanHz: 25_000, band: BAND_40M })
    expect(center - 12_500).toBeGreaterThanOrEqual(7_000_000 - 25_000 * 0.03)
    expect(center - 12_500).toBeLessThanOrEqual(7_001_000)
  })
})
