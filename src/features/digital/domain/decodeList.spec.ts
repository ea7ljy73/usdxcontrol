import { describe, expect, it } from 'vitest'
import { addSlotDecodes, addTxEcho, rxFrequencyDecodes } from './decodeList'

describe('lista de decodificados', () => {
  it('ordena por tono, redondea y clasifica cada mensaje', () => {
    const list = addSlotDecodes(
      [],
      [
        { db: -9.4, dt: 0.56, df: 2159.4, text: 'WM3PEN EA6VQ -09' },
        { db: 2, dt: 0.1, df: 721.9, text: 'CQ EA7LJY IM76' },
      ],
      'FT8',
      1_000,
    )
    expect(list.map((d) => d.audioHz)).toEqual([722, 2159])
    expect(list[0]).toMatchObject({ snrDb: 2, dtS: 0.1, parsed: { kind: 'cq', fromCall: 'EA7LJY', grid: 'IM76' } })
    expect(list[1].snrDb).toBe(-9)
    expect(list[1].dtS).toBe(0.6)
  })

  it('el ciclo nuevo va arriba y sin repetidos', () => {
    const first = addSlotDecodes([], [{ db: 0, dt: 0, df: 500, text: 'CQ A1AA FN42' }], 'FT8', 0)
    const next = addSlotDecodes(
      first,
      [
        { db: 0, dt: 0, df: 900, text: 'CQ B1BB FN42' },
        { db: 1, dt: 0, df: 901, text: 'CQ B1BB FN42' },
      ],
      'FT8',
      15_000,
    )
    expect(next.map((d) => d.text)).toEqual(['CQ B1BB FN42', 'CQ A1AA FN42'])
    expect(new Set(next.map((d) => d.id)).size).toBe(2)
  })
})

describe('eco de transmisión', () => {
  it('lo emitido entra arriba marcado como TX y sobrevive a los decodificados de su ciclo', () => {
    const withEcho = addTxEcho([], 'CQ EA7LJY IM76', 'FT8', 15_000, 1_000)
    expect(withEcho[0]).toMatchObject({ tx: true, audioHz: 1_000, parsed: { kind: 'cq' } })
    const next = addSlotDecodes(withEcho, [{ db: 0, dt: 0, df: 500, text: 'CQ A1AA FN42' }], 'FT8', 15_000)
    expect(next.map((d) => d.text)).toEqual(['CQ A1AA FN42', 'CQ EA7LJY IM76'])
  })
})

describe('panel Rx Frequency', () => {
  it('se queda con lo oído en nuestra frecuencia, lo dirigido a nosotros, la DX y lo emitido', () => {
    let list = addSlotDecodes(
      [],
      [
        { db: 0, dt: 0, df: 1_520, text: 'CQ A1AA FN42' },
        { db: 0, dt: 0, df: 600, text: 'EA7LJY B1BB -10' },
        { db: 0, dt: 0, df: 2_400, text: 'C1CC D1DD R-05' },
        { db: 0, dt: 0, df: 900, text: 'E1EE F5BZB RR73' },
      ],
      'FT8',
      0,
    )
    list = addTxEcho(list, 'CQ EA7LJY IM76', 'FT8', 15_000, 2_000)
    const texts = rxFrequencyDecodes(list, { rxHz: 1_500, myCall: 'ea7ljy', dxCall: 'F5BZB' }).map((d) => d.text)
    expect(texts).toEqual(['CQ EA7LJY IM76', 'EA7LJY B1BB -10', 'E1EE F5BZB RR73', 'CQ A1AA FN42'])
  })
})
