import { describe, expect, it } from 'vitest'
import { bandOf, parsePskReports, summarizePsk } from './pskReport'

const raw = [
  { receiverCallsign: 'ct2hmr', receiverLocator: 'IN51WG', frequency: '7075826', flowStartSeconds: '1794242325', mode: 'FT8', sNR: '-14' },
  { receiverCallsign: 'EB5RCA', receiverLocator: 'IM88WS', frequency: 7075825, flowStartSeconds: 1794242175, mode: 'FT8', sNR: -11 },
  // Repetida en el mismo minuto y banda: se descarta.
  { receiverCallsign: 'EB5RCA', receiverLocator: 'IM88WS', frequency: 7075830, flowStartSeconds: 1794242180, mode: 'FT8', sNR: -12 },
  { receiverCallsign: 'SV4OZF', receiverLocator: 'KM19EP', frequency: '7075005', flowStartSeconds: '1794241875', mode: 'FT8' },
  { receiverLocator: 'JN11', frequency: '7075000', flowStartSeconds: '1794241875' },
]

describe('PSK Reporter', () => {
  it('lee las escuchas, de la más reciente a la más antigua y sin repetidas', () => {
    const spots = parsePskReports(raw)
    expect(spots.map((spot) => spot.receiver)).toEqual(['CT2HMR', 'EB5RCA', 'SV4OZF'])
    expect(spots[0]).toMatchObject({ locator: 'IN51WG', frequencyHz: 7_075_826, snrDb: -14, mode: 'FT8', timeMs: 1_794_242_325_000 })
    expect(spots[2].snrDb).toBeNull()
  })

  it('resume cuántos nos oyen, la mejor SNR y el más lejano', () => {
    const summary = summarizePsk(parsePskReports(raw), 'IM87')
    expect(summary).toMatchObject({ count: 3, bestSnr: -11, farthestCall: 'SV4OZF' })
    expect(summary.farthestKm).toBeGreaterThan(2_000)
  })

  it('banda de una frecuencia', () => {
    expect(bandOf(7_075_826)).toBe('40m')
    expect(bandOf(14_075_000)).toBe('20m')
    expect(bandOf(1_000)).toBe('—')
  })
})
