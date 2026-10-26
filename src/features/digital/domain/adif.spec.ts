import { describe, it, expect } from 'vitest'
import { logsToAdif, parseAdif, type AdifLog } from './adif'

const base: AdifLog = {
  myCall: 'EA7LJY',
  hisCall: 'K1JT',
  freq: '14.074',
  mode: 'DIGI',
  rstSent: '-10',
  rstRecv: '-08',
  date: '2026-08-25',
  time: '13:14',
  notes: 'FT8 vía web · 20m',
}

describe('logsToAdif', () => {
  it('cabecera con longitudes correctas (PROGRAMID:7 para RadioCQ)', () => {
    const out = logsToAdif([base])
    expect(out).toContain('<PROGRAMID:7>RadioCQ')
    expect(out).toContain('<ADIF_VER:5>3.1.0')
    expect(out).toContain('<EOH>')
  })

  it('mapea DIGI + notas FT8 al modo ADIF FT8', () => {
    const out = logsToAdif([base])
    expect(out).toContain('<MODE:3>FT8')
  })

  it('convierte kHz a MHz y detecta la banda (7074 kHz → 7.074000, 40M)', () => {
    const out = logsToAdif([{ ...base, freq: '7074' }])
    expect(out).toContain('<FREQ:8>7.074000')
    expect(out).toContain('<BAND:3>40M')
  })

  it('omite BAND cuando la frecuencia no es una banda conocida', () => {
    const out = logsToAdif([{ ...base, freq: '12.345' }])
    expect(out).not.toContain('<BAND:')
  })

  it('TIME_ON se normaliza a HHMMSS', () => {
    const out = logsToAdif([base])
    expect(out).toContain('<TIME_ON:6>131400')
  })
})

describe('parseAdif', () => {
  it('re-lee un registro generado', () => {
    const rec = logsToAdif([base]).split('<EOR>')[0]
    const logs = parseAdif(rec)
    expect(logs).toHaveLength(1)
    expect(logs[0].hisCall).toBe('K1JT')
    expect(logs[0].mode).toBe('FT8')
    expect(logs[0].date).toBe('2026-08-25')
    expect(logs[0].time).toBe('13:14')
  })

  it('acepta registros solo con BAND (usa frecuencia central)', () => {
    const logs = parseAdif('<CALL:4>EA4X <BAND:3>20M <MODE:3>FT8 <QSO_DATE:8>20260801 <TIME_ON:4>1010 <EOR>')
    expect(logs).toHaveLength(1)
    expect(parseFloat(logs[0].freq)).toBeCloseTo(14.074, 2)
  })

  it('descarta registros sin indicativo', () => {
    const logs = parseAdif('<FREQ:6>14.074 <EOR>')
    expect(logs).toHaveLength(0)
  })
})
