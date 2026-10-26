import { describe, expect, it } from 'vitest'
import { sdrCenterFor } from './sdrTuning'

const forty = { fromHz: 7_000_000, toHz: 7_200_000 }
const ten = { fromHz: 28_000_000, toHz: 29_700_000 }

describe('centro del SDR', () => {
  it('si la banda cabe se queda en su centro aunque se mueva el VFO', () => {
    expect(sdrCenterFor({ vfoHz: 7_074_000, band: forty, currentHz: null, sampleRate: 2_048_000 })).toBe(7_100_000)
    expect(sdrCenterFor({ vfoHz: 7_190_000, band: forty, currentHz: 7_100_000, sampleRate: 2_048_000 })).toBe(7_100_000)
  })

  it('si no cabe sigue al VFO con margen y sin salirse de la banda', () => {
    const rate = 1_024_000
    const first = sdrCenterFor({ vfoHz: 28_074_000, band: ten, currentHz: null, sampleRate: rate })
    expect(first).toBeGreaterThan(28_074_000)
    expect(sdrCenterFor({ vfoHz: 28_200_000, band: ten, currentHz: first, sampleRate: rate })).toBe(first)
    const moved = sdrCenterFor({ vfoHz: 29_600_000, band: ten, currentHz: first, sampleRate: rate })
    expect(moved).toBeLessThan(29_600_000)
    expect(moved + (rate * 0.85) / 2).toBeGreaterThan(29_600_000)
  })
})
