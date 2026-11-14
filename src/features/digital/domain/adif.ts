import type { LogEntry } from './logbook'

export interface AdifLog {
  myCall: string
  hisCall: string
  freq: string
  mode: string
  rstSent: string
  rstRecv: string
  date: string
  time: string
  notes?: string
}

function field(name: string, value: string): string {
  const clean = value.trim()
  return `<${name}:${clean.length}>${clean} `
}

const utcParts = (iso: string): { date: string; time: string } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso)
  return match ? { date: `${match[1]}${match[2]}${match[3]}`, time: `${match[4]}${match[5]}${match[6]}` } : null
}

const optional = (record: string, name: string, value: string | null | undefined): string =>
  value && value.trim() ? record + field(name, value) : record

/** Un QSO del libro en un registro ADIF completo, con estación, locator y hora de fin. */
export function logEntryToAdif(entry: LogEntry): string {
  const mhz = (entry.dialHz + entry.toneHz) / 1e6
  const band = mhz > 0 ? bandFromFreqMhz(mhz) : null
  const on = utcParts(entry.startedAt)
  const off = utcParts(entry.endedAt)
  let record = ''
  if (on) record += field('QSO_DATE', on.date) + field('TIME_ON', on.time)
  if (off) record += field('QSO_DATE_OFF', off.date) + field('TIME_OFF', off.time)
  record = optional(record, 'CALL', entry.call)
  record = optional(record, 'STATION_CALLSIGN', entry.myCall)
  record = optional(record, 'MY_GRIDSQUARE', entry.myGrid)
  record = optional(record, 'GRIDSQUARE', entry.grid)
  if (band) record = optional(record, 'BAND', band)
  if (mhz > 0) record = optional(record, 'FREQ', mhz.toFixed(6))
  record = optional(record, 'MODE', entry.mode)
  record = optional(record, 'RST_SENT', entry.rstSent)
  record = optional(record, 'RST_RCVD', entry.rstRcvd)
  record = optional(record, 'COMMENT', entry.notes)
  return `${record}<EOR>`
}

/** Documento ADIF (cabecera + registros) para subir uno o varios QSO a un logbook online. */
export function logEntriesToAdif(entries: LogEntry[]): string {
  const header = '<ADIF_VER:5>3.1.4 <PROGRAMID:11>uSDXControl <EOH>'
  return `${header}\n${entries.map(logEntryToAdif).join('\n')}\n`
}

/** Banda ADIF a partir de la frecuencia en MHz (null si no es una banda conocida). */
export function bandFromFreqMhz(numeric: number): string | null {
  if (numeric >= 0.1357 && numeric <= 0.1378) return '2190M'
  if (numeric >= 0.472 && numeric <= 0.480) return '630M'
  if (numeric >= 1.8 && numeric <= 2.0) return '160M'
  if (numeric >= 3.5 && numeric <= 4.0) return '80M'
  if (numeric >= 5.3515 && numeric <= 5.3665) return '60M'
  if (numeric >= 7.0 && numeric <= 7.3) return '40M'
  if (numeric >= 10.1 && numeric <= 10.15) return '30M'
  if (numeric >= 14.0 && numeric <= 14.35) return '20M'
  if (numeric >= 18.068 && numeric <= 18.168) return '17M'
  if (numeric >= 21.0 && numeric <= 21.45) return '15M'
  if (numeric >= 24.89 && numeric <= 24.99) return '12M'
  if (numeric >= 28.0 && numeric <= 29.7) return '10M'
  if (numeric >= 40.67 && numeric <= 40.68) return '8M'
  if (numeric >= 50.0 && numeric <= 54.0) return '6M'
  if (numeric >= 70.0 && numeric <= 71.0) return '4M'
  if (numeric >= 144.0 && numeric <= 148.0) return '2M'
  if (numeric >= 222.0 && numeric <= 225.0) return '1_25M'
  if (numeric >= 430.0 && numeric <= 440.0) return '70CM'
  if (numeric >= 1240.0 && numeric <= 1300.0) return '23CM'
  return null
}

/**
 * Traduce el modo interno del logbook a un modo ADIF válido.
 * Los QSO digitales se guardan como "DIGI"; el modo concreto está en las notas
 * (p. ej. "FT8 vía web · 20m").
 */
function modeAdifFrom(mode: string, notes?: string): string {
  const m = mode.toUpperCase()
  if (m !== 'DIGI') return m || 'SSB'
  const n = (notes || '').toUpperCase()
  if (n.includes('FT4')) return 'FT4'
  if (n.includes('FT8')) return 'FT8'
  return 'FT8'
}

export function logsToAdif(logs: AdifLog[]): string {
  const lines: string[] = []
  lines.push(`<ADIF_VER:5>3.1.0 <PROGRAMID:7>RadioCQ <PROGRAMVERSION:5>1.0.0 <EOH>`)
  for (const l of logs) {
    // Acepta kHz o MHz: >=1000 se interpreta como kHz
    let freq = l.freq.replace(',', '.').trim()
    const raw = parseFloat(freq)
    if (Number.isNaN(raw)) continue
    if (raw >= 1000) freq = (raw / 1000).toFixed(6)
    const band = bandFromFreqMhz(parseFloat(freq))
    const dateCompact = l.date.replace(/[-/]/g, '')
    const timeCompact = l.time.replace(/[:.]/g, '').padEnd(6, '0').slice(0, 6)
    let record = ''
    record += field('QSO_DATE', dateCompact)
    record += field('TIME_ON', timeCompact)
    record += field('CALL', l.hisCall)
    record += field('FREQ', String(parseFloat(freq).toFixed(6)))
    // Sin banda conocida se omite el campo: "HF" no es un valor ADIF válido
    if (band) record += field('BAND', band)
    record += field('MODE', modeAdifFrom(l.mode, l.notes))
    record += field('RST_SENT', l.rstSent)
    record += field('RST_RCVD', l.rstRecv)
    if (l.notes) record += field('COMMENT', l.notes)
    record += `<EOR>`
    lines.push(record)
  }
  return `RadioCQ ADIF Export\n` + lines.join('\n') + '\n'
}

export function parseAdif(text: string): AdifLog[] {
  const rows = text.split(/<eor>/i)
  const out: AdifLog[] = []
  for (const row of rows) {
    const fields = [...row.matchAll(/<([A-Z0-9_]+):\d+>([^<]*)/gi)]
    const rec: Record<string, string> = {}
    for (const m of fields) rec[m[1].toUpperCase()] = m[2].trim()
    const call = rec.CALL || rec.CALLSIGN
    // Fallback de banda→frecuencia central cuando el registro solo trae BAND
    const BAND_CENTER_MHZ: Record<string, number> = {
      '160M': 1.85, '80M': 3.573, '60M': 5.357, '40M': 7.074, '30M': 10.136,
      '20M': 14.074, '17M': 18.1, '15M': 21.074, '12M': 24.915, '10M': 28.074,
      '6M': 50.313, '4M': 70.154, '2M': 145.5, '70CM': 433.5,
    }
    let freq = rec.FREQ?.replace(',', '.')
    if ((!freq || Number.isNaN(parseFloat(freq))) && rec.BAND) {
      const center = BAND_CENTER_MHZ[rec.BAND.toUpperCase()]
      if (center) freq = String(center)
    }
    if (!call || !freq) continue
    const d = (rec.QSO_DATE || '').replace(/[^0-9]/g, '')
    const t = (rec.TIME_ON || rec.TIME_OFF || '').replace(/[^0-9]/g, '')
    out.push({
      myCall: '',
      hisCall: call.toUpperCase(),
      freq,
      mode: (rec.MODE || 'SSB').toUpperCase(),
      rstSent: rec.RST_SENT || '59',
      rstRecv: rec.RST_RCVD || '59',
      date: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : new Date().toISOString().split('T')[0],
      time: t.length >= 4 ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : '00:00',
      notes: rec.COMMENT || '',
    })
  }
  return out
}
