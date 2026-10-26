import { describe, expect, it } from 'vitest'
import { formatSlotUtc, nextTxSlot, slotIndex, slotLengthMs, slotParity, slotProgress, slotStartMs } from './slots'

const at = (iso: string) => Date.parse(iso)

describe('ciclos FT8/FT4', () => {
  it('FT8 dura 15 s y FT4 7,5 s', () => {
    expect(slotLengthMs('FT8')).toBe(15_000)
    expect(slotLengthMs('FT4')).toBe(7_500)
  })

  it('el ciclo empieza en los segundos 00/15/30/45 en FT8', () => {
    const index = slotIndex(at('2026-10-25T12:34:52.300Z'), 'FT8')
    expect(slotStartMs(index, 'FT8')).toBe(at('2026-10-25T12:34:45Z'))
    expect(formatSlotUtc(slotStartMs(index, 'FT8'))).toBe('123445')
  })

  it('FT4 cae en medios segundos', () => {
    const index = slotIndex(at('2026-10-25T12:34:08Z'), 'FT4')
    expect(slotStartMs(index, 'FT4')).toBe(at('2026-10-25T12:34:07.500Z'))
  })

  it('progreso dentro del ciclo', () => {
    expect(slotProgress(at('2026-10-25T12:34:52.500Z'), 'FT8')).toBeCloseTo(0.5)
    expect(slotProgress(at('2026-10-25T12:34:45Z'), 'FT8')).toBe(0)
  })
})

describe('secuencia de transmisión', () => {
  it('par = :00/:30 e impar = :15/:45', () => {
    expect(slotParity(slotIndex(at('2026-10-25T12:34:31Z'), 'FT8'))).toBe('even')
    expect(slotParity(slotIndex(at('2026-10-25T12:34:46Z'), 'FT8'))).toBe('odd')
  })

  it('el ciclo propio en curso vale si se llega a tiempo; si no, el siguiente propio', () => {
    const early = at('2026-10-25T12:34:31.200Z')
    expect(slotStartMs(nextTxSlot(early, 'FT8', 'even'), 'FT8')).toBe(at('2026-10-25T12:34:30Z'))
    const late = at('2026-10-25T12:34:33Z')
    expect(slotStartMs(nextTxSlot(late, 'FT8', 'even'), 'FT8')).toBe(at('2026-10-25T12:35:00Z'))
    expect(slotStartMs(nextTxSlot(late, 'FT8', 'odd'), 'FT8')).toBe(at('2026-10-25T12:34:45Z'))
  })
})
