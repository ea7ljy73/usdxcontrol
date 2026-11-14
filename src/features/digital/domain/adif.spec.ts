import { describe, it, expect } from 'vitest'
import { logEntriesToAdif, logEntryToAdif, logsToAdif, parseAdif, type AdifLog } from './adif'
import type { LogEntry } from './logbook'

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

const entry: LogEntry = {
  id: '2026-08-25T13:15:00.000Z-K1JT',
  myCall: 'EA7LJY',
  myGrid: 'IM76HK',
  call: 'K1JT',
  grid: 'FN20',
  dialHz: 14_074_000,
  toneHz: 1_000,
  mode: 'FT8',
  rstSent: '-10',
  rstRcvd: '-08',
  startedAt: '2026-08-25T13:14:00.000Z',
  endedAt: '2026-08-25T13:15:00.000Z',
  notes: 'prueba',
}

describe('logEntryToAdif', () => {
  it('incluye estación, locator, hora de fin y frecuencia real', () => {
    const out = logEntryToAdif(entry)
    expect(out).toContain('<CALL:4>K1JT')
    expect(out).toContain('<STATION_CALLSIGN:6>EA7LJY')
    expect(out).toContain('<MY_GRIDSQUARE:6>IM76HK')
    expect(out).toContain('<GRIDSQUARE:4>FN20')
    expect(out).toContain('<QSO_DATE:8>20260825')
    expect(out).toContain('<TIME_ON:6>131400')
    expect(out).toContain('<QSO_DATE_OFF:8>20260825')
    expect(out).toContain('<TIME_OFF:6>131500')
    expect(out).toContain('<BAND:3>20M')
    expect(out).toContain('<FREQ:9>14.075000')
    expect(out).toContain('<MODE:3>FT8')
    expect(out).toContain('<RST_SENT:3>-10')
    expect(out).toContain('<COMMENT:6>prueba')
    expect(out.endsWith('<EOR>')).toBe(true)
  })

  it('omite campos vacíos y genera un documento con cabecera', () => {
    const out = logEntriesToAdif([{ ...entry, myCall: '', myGrid: '', grid: '', notes: '', rstSent: '', rstRcvd: '' }])
    expect(out).toContain('<ADIF_VER:5>3.1.4')
    expect(out).toContain('<PROGRAMID:11>uSDXControl')
    expect(out).not.toContain('<STATION_CALLSIGN:')
    expect(out).not.toContain('<MY_GRIDSQUARE:')
    expect(out).not.toContain('<COMMENT:')
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
