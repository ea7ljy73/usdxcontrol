import { describe, expect, it } from 'vitest'
import { findClearFrequency } from './clearFrequency'
import type { DigiDecode } from './decodeList'

const NOW = Date.parse('2026-10-25T12:35:00Z')

const decode = (audioHz: number, agoMs = 15_000, extra: Partial<DigiDecode> = {}): DigiDecode => ({
  id: `${audioHz}-${agoMs}`,
  mode: 'FT8',
  slotStartMs: NOW - agoMs,
  snrDb: -10,
  dtS: 0.1,
  audioHz,
  text: 'CQ A1AA FN42',
  parsed: null,
  ...extra,
})

describe('buscar hueco libre para TX', () => {
  it('se queda en el tono actual si ya está limpio', () => {
    const result = findClearFrequency({ decodes: [decode(500), decode(2_200)], mode: 'FT8', nowMs: NOW, currentHz: 1_400 })
    expect(result.hz).toBe(1_400)
    expect(result.busy).toBe(2)
  })

  it('sale de encima de una estación al hueco limpio más cercano', () => {
    const busy = [400, 600, 800, 1_000, 1_200, 1_380, 1_500, 1_700, 1_900, 2_100, 2_300, 2_500].map((hz) => decode(hz))
    const result = findClearFrequency({ decodes: busy, mode: 'FT8', nowMs: NOW, currentHz: 1_381 })
    // El hueco limpio más cercano: 30 Hz por debajo de 1380 (la señal ocupa 50 Hz).
    expect(result).toMatchObject({ hz: 1_300, gapHz: 30 })
  })

  it('prefiere un hueco amplio aunque esté más lejos que uno estrecho', () => {
    const busy = [300, 360, 420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1_020, 1_080, 1_140, 1_200, 1_260, 1_320, 1_380, 1_440, 1_500]
    const result = findClearFrequency({ decodes: busy.map((hz) => decode(hz)), mode: 'FT8', nowMs: NOW, currentHz: 1_000 })
    expect(result).toMatchObject({ hz: 1_580, gapHz: 30 })
  })

  it('con la banda llena no se va al borde vacío (por debajo de 500 Hz los receptores recortan)', () => {
    // Lo decodificado a las 19:36–19:39 UTC en 20 m: el borde de abajo, libre, no vale.
    const busy = [494, 600, 647, 713, 750, 875, 1_047, 1_094, 1_119, 1_122, 1_178, 1_278, 1_334, 1_366, 1_369, 1_431, 1_438,
      1_444, 1_497, 1_503, 1_619, 1_663, 1_691, 1_700, 1_753, 1_763, 1_869, 1_931, 2_231, 2_466, 2_472, 2_722, 2_834, 2_838]
    const result = findClearFrequency({ decodes: busy.map((hz) => decode(hz)), mode: 'FT8', nowMs: NOW, currentHz: 1_345 })
    expect(result.hz).toBeGreaterThanOrEqual(500)
    expect(result.gapHz).toBeGreaterThanOrEqual(30)
    expect(Math.abs(result.hz - 1_345)).toBeLessThan(500)
  })

  it('ignora lo antiguo, nuestras emisiones y el otro modo', () => {
    const decodes = [
      decode(1_400, 10 * 60_000),
      decode(1_400, 15_000, { tx: true }),
      decode(1_400, 15_000, { mode: 'FT4' }),
    ]
    const result = findClearFrequency({ decodes, mode: 'FT8', nowMs: NOW, currentHz: 1_400 })
    expect(result).toMatchObject({ hz: 1_400, busy: 0 })
  })
})
