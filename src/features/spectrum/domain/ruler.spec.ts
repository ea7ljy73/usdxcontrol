import { describe, expect, it } from 'vitest'
import { buildRulerTicks, rulerStep } from './ruler'

describe('regla de frecuencia', () => {
  it('elige un paso que reparta el espectro en 8-12 cruzetas', () => {
    expect(rulerStep(4_800)).toBe(500)
    expect(rulerStep(2_400)).toBe(250)
    expect(rulerStep(1_200)).toBe(100)
  })

  it('genera cruzetas alineadas a múltiplos del paso con ratios en (0,1)', () => {
    const ticks = buildRulerTicks(7_074_000, 4_800, 500)
    expect(ticks[0].freqHz).toBe(7_072_000)
    expect(ticks.at(-1)?.freqHz).toBeLessThan(7_076_400)
    expect(ticks.every((tick) => tick.ratio > 0 && tick.ratio < 1)).toBe(true)
    const positions = ticks.map((tick) => tick.ratio)
    expect([...positions].every((value, i) => i === 0 || value > positions[i - 1])).toBe(true)
  })
})
