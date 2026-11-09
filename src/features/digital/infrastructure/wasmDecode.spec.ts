// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { ftxDecode, ftxEncode, setFtxWasmBinary } from './ftxEngine'

const pcmOf = (file: string) => {
  const wav = readFileSync(new URL(file, import.meta.url))
  const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) / 2)
  return Float32Array.from(pcm, (v) => v / 32_768)
}

// Ruido gaussiano reproducible (para que la prueba no dependa del azar).
const noise = (length: number, sigma: number, seed = 1) => {
  let state = seed
  const uniform = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return (state + 1) / 2_147_483_649
  }
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = sigma * Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform())
  return out
}

// Mezcla un mensaje en el ciclo, empezando a los 0,5 s (DT = 0) y con la SNR pedida (en 2500 Hz).
const mix = (into: Float32Array, wave: Float32Array, snrDb: number, sigma: number) => {
  const amplitude = Math.sqrt(2 * sigma * sigma * (2_500 / 6_000) * 10 ** (snrDb / 10))
  for (let i = 0; i < wave.length; i++) into[6_000 + i] += amplitude * wave[i]
}

beforeAll(() => {
  setFtxWasmBinary(readFileSync(new URL('./vendor/ftx.wasm', import.meta.url)))
})

describe('motor FT8/FT4', () => {
  it('decodifica la grabación de muestra con SNR y DT como WSJT-X', async () => {
    const decodes = await ftxDecode('FT8', pcmOf('./sim/sample_ft8.wav'), 12_000)
    expect(decodes.length).toBeGreaterThanOrEqual(8)
    const w1fc = decodes.find((d) => d.text === 'W1FC F5BZB -08')
    expect(w1fc).toBeDefined()
    // SNR en dB (no la puntuación de sincronismo) y DT respecto a los 0,5 s del ciclo.
    for (const d of decodes) {
      expect(d.db).toBeGreaterThanOrEqual(-24)
      expect(d.db).toBeLessThan(20)
      expect(Math.abs(d.dt)).toBeLessThan(1)
    }
    expect(decodes.filter((d) => d.db < 0).length).toBeGreaterThanOrEqual(5)
  }, 60_000)

  it.each(['FT8', 'FT4'] as const)('%s: codifica y decodifica con SNR y DT correctos', async (mode) => {
    const wave = await ftxEncode(mode, 'CQ EA7TST IM76', 1_200)
    expect(wave).not.toBeNull()
    // Solo la emisión: 79 símbolos de 160 ms (FT8) o 105 de 48 ms (FT4).
    expect(wave!.length).toBe(mode === 'FT8' ? 151_680 : 60_480)
    const sigma = 0.05
    const slot = noise(mode === 'FT8' ? 180_000 : 90_000, sigma)
    mix(slot, wave!, -10, sigma)
    const [decode] = await ftxDecode(mode, slot, 12_000)
    expect(decode.text).toBe('CQ EA7TST IM76')
    expect(Math.abs(decode.df - 1_200)).toBeLessThan(5)
    expect(Math.abs(decode.dt)).toBeLessThan(0.1)
    expect(decode.db).toBeGreaterThan(-16)
    expect(decode.db).toBeLessThan(-8)
  }, 60_000)

  it('aguanta una banda llena sin colgarse ni truncar mensajes', async () => {
    const sigma = 0.03
    const slot = noise(180_000, sigma, 7)
    const sent: string[] = []
    for (let i = 0; i < 60; i++) {
      const text = `CQ EA${i % 10}A${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))} IM76`
      sent.push(text)
      mix(slot, (await ftxEncode('FT8', text, 150 + i * 48))!, -5, sigma)
    }
    const decodes = await ftxDecode('FT8', slot, 12_000)
    expect(decodes.length).toBeGreaterThanOrEqual(55)
    for (const d of decodes) expect(sent).toContain(d.text)
  }, 60_000)

  it('no codifica mensajes imposibles', async () => {
    expect(await ftxEncode('FT8', 'ESTO NO ES UN MENSAJE FT8 VALIDO', 1_000)).toBeNull()
  })
})
