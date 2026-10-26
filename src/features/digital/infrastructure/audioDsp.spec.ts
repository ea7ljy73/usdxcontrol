import { describe, it, expect } from 'vitest'
import { downsampleTo12k, resampleAudio } from './audioDsp'

describe('downsampleTo12k', () => {
  it('decima 48 kHz → 12 kHz (longitud /4)', () => {
    const src = new Float32Array(48000)
    const out = downsampleTo12k(src, 48000)
    expect(out.length).toBe(12000)
  })

  it('elimina la componente continua', () => {
    const src = new Float32Array(4800).fill(0.5)
    const out = downsampleTo12k(src, 48000)
    const mean = out.reduce((a, b) => a + b, 0) / out.length
    expect(Math.abs(mean)).toBeLessThan(1e-6)
  })

  it('a 12 kHz devuelve copia con DC eliminada (sin mutar la entrada)', () => {
    const src = new Float32Array([0.1, -0.2, 0.3])
    const out = downsampleTo12k(src, 12000)
    expect(out).not.toBe(src)
    const mean = src.reduce((a, b) => a + b, 0) / src.length
    out.forEach((v, i) => expect(v).toBeCloseTo(src[i] - mean, 5))
  })

  it('re-muestrea 8 kHz → 12 kHz (WebSDR), longitud ×1,5', () => {
    const src = new Float32Array(8000)
    const out = downsampleTo12k(src, 8000)
    expect(out.length).toBe(12000)
  })

  it('una senoidal de 1 kHz a 48 kHz conserva su energía tras decimar', () => {
    const n = 48000
    const src = new Float32Array(n)
    for (let i = 0; i < n; i++) src[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000)
    const out = downsampleTo12k(src, 48000)
    // energía por muestra comparable (el FIR con ganancia unitaria la conserva)
    const energy = (a: Float32Array) => a.reduce((acc, v) => acc + v * v, 0) / a.length
    const ratio = energy(out) / energy(src)
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(1.1)
  })
})

describe('resampleAudio', () => {
  it('misma tasa devuelve la referencia intacta', () => {
    const src = new Float32Array(100)
    expect(resampleAudio(src, 12000, 12000)).toBe(src)
  })

  it('sube 12 kHz → 48 kHz para el TX (×4)', () => {
    const out = resampleAudio(new Float32Array(12000), 12000, 48000)
    expect(out.length).toBe(48000)
  })
})
