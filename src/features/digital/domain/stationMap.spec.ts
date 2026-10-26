import { describe, expect, it } from 'vitest'
import { addSlotDecodes, addTxEcho } from './decodeList'
import { mapStations } from './stationMap'

describe('mapa de estaciones', () => {
  it('sitúa por locator y, sin él, por el país; ignora lo transmitido', () => {
    let list = addSlotDecodes([], [{ db: -3, dt: 0, df: 700, text: 'CQ EA7LJY IM76' }], 'FT8', 0)
    list = addSlotDecodes(list, [{ db: -12, dt: 0, df: 1200, text: 'EA7LJY F5BZB -08' }], 'FT8', 15_000)
    list = addTxEcho(list, 'CQ EA7XXX IM76', 'FT8', 30_000, 1_000)
    const stations = mapStations(list)
    expect(stations.map((s) => s.call)).toEqual(['F5BZB', 'EA7LJY'])
    expect(stations[1]).toMatchObject({ precise: true, grid: 'IM76', cq: true })
    expect(stations[0]).toMatchObject({ precise: false, country: 'Francia' })
  })

  it('conserva el locator conocido aunque los siguientes mensajes no lo traigan', () => {
    let list = addSlotDecodes([], [{ db: -3, dt: 0, df: 700, text: 'CQ EA7LJY IM76' }], 'FT8', 0)
    list = addSlotDecodes(list, [{ db: 4, dt: 0, df: 700, text: 'F5BZB EA7LJY R-10' }], 'FT8', 15_000)
    const [station] = mapStations(list)
    expect(station).toMatchObject({ precise: true, grid: 'IM76', snrDb: 4, lastHeardMs: 15_000 })
  })

  it('filtra por antigüedad', () => {
    const list = addSlotDecodes([], [{ db: 0, dt: 0, df: 700, text: 'CQ EA7LJY IM76' }], 'FT8', 0)
    expect(mapStations(list, 15_000)).toEqual([])
  })
})
