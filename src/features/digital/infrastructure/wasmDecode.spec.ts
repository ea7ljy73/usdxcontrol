// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ft8EngineDecode } from './ft8engine'

// Decodificación real de una grabación FT8 con el motor WASM (ft8_lib).
describe('motor FT8', () => {
  it('decodifica la grabación de muestra', async () => {
    const wav = readFileSync(new URL('./sim/sample_ft8.wav', import.meta.url))
    const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) / 2)
    const decodes = await ft8EngineDecode(Float32Array.from(pcm, (v) => v / 32_768), 12_000)
    expect(decodes.length).toBeGreaterThanOrEqual(8)
    expect(decodes.map((d) => d.text)).toContain('W1FC F5BZB -08')
  }, 60_000)
})
