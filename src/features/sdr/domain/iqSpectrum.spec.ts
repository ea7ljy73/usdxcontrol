import { describe, expect, it } from 'vitest'
import { iqSpectrumDb } from './iqSpectrum'

const tone = (bins: number, size: number, amplitude: number, blocks = 2) => {
  const iq = new Uint8Array(size * 2 * blocks)
  for (let n = 0; n < size * blocks; n++) {
    const phase = (2 * Math.PI * bins * n) / size
    iq[2 * n] = Math.round(127.5 + 127.5 * amplitude * Math.cos(phase))
    iq[2 * n + 1] = Math.round(127.5 + 127.5 * amplitude * Math.sin(phase))
  }
  return iq
}

describe('espectro IQ', () => {
  it('coloca un tono positivo a la derecha del centro y uno negativo a la izquierda', () => {
    const size = 1_024
    const up = iqSpectrumDb(tone(100, size, 0.5), size)
    const down = iqSpectrumDb(tone(-100, size, 0.5), size)
    const peak = (spectrum: Float32Array) => spectrum.indexOf(Math.max(...spectrum))
    expect(peak(up)).toBe(size / 2 + 100)
    expect(peak(down)).toBe(size / 2 - 100)
    // Amplitud 0,5 → unos -6 dBFS (la cuantización de 8 bits resta décimas).
    expect(up[size / 2 + 100]).toBeGreaterThan(-7)
    expect(up[size / 2 + 100]).toBeLessThan(-5)
  })

  it('tapa el pico de continua del centro', () => {
    const size = 256
    const dc = new Uint8Array(size * 2).fill(200)
    const spectrum = iqSpectrumDb(dc, size)
    expect(spectrum[size / 2]).toBeLessThan(-60)
  })
})
