import { describe, expect, it } from 'vitest'
import type { SpectrumFrame } from '../application/ports'
import { hasSignal, passbandSnrDb } from './signalDetect'

const frame = (peaks: Record<number, number> = {}): SpectrumFrame => {
  const bins = new Float32Array(400).map((_, i) => -95 + (i % 3) * 2)
  for (const [hz, db] of Object.entries(peaks)) bins[Math.round(Number(hz) / 10)] = db
  return { kind: 'audio', binHz: 10, bins }
}

describe('detección de señal en el pasabanda', () => {
  it('solo ruido no es señal', () => {
    expect(passbandSnrDb(frame(), [300, 2700])).toBe(2)
    expect(hasSignal(frame(), [300, 2700])).toBe(false)
  })

  it('una portadora dentro del pasabanda es señal', () => {
    expect(hasSignal(frame({ 1500: -50 }), [300, 2700])).toBe(true)
  })

  it('una señal fuera del pasabanda no cuenta', () => {
    expect(hasSignal(frame({ 3500: -40 }), [300, 2700])).toBe(false)
  })

  it('sin pasabanda, sin datos o con trama de RF no detiene nada', () => {
    expect(hasSignal(frame({ 1500: -50 }), null)).toBe(false)
    expect(hasSignal(null, [300, 2700])).toBe(false)
    const rf: SpectrumFrame = { kind: 'rf', startHz: 7_000_000, binHz: 10, bins: new Float32Array(10) }
    expect(passbandSnrDb(rf, [300, 2700])).toBeNull()
  })
})
