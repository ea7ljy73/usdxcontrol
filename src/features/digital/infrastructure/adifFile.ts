import { logEntriesToAdif, parseAdif } from '../domain/adif'
import type { LogEntry } from '../domain/logbook'

// Descarga el libro en ADIF (para LoTW, QRZ, Log4OM…).
export const downloadAdif = (entries: LogEntry[], callsign: string) => {
  const blob = new Blob([logEntriesToAdif(entries)], { type: 'application/adif;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${(callsign || 'usdx').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.adi`
  link.click()
  URL.revokeObjectURL(url)
}

// Lee un fichero ADIF y lo convierte a entradas del libro.
export const readAdifFile = async (file: File, myCall: string): Promise<LogEntry[]> =>
  parseAdif(await file.text()).map((log) => {
    const mhz = Number.parseFloat(log.freq)
    const hz = Number.isFinite(mhz) ? Math.round((mhz >= 1_000 ? mhz / 1_000 : mhz) * 1e6) : 0
    // parseAdif da la fecha como AAAA-MM-DD y la hora como HH:MM.
    const endedAt = `${log.date}T${log.time.length === 5 ? `${log.time}:00` : log.time}Z`
    return {
      id: `${endedAt}-${log.hisCall.toUpperCase()}`,
      myCall: (log.myCall || myCall).toUpperCase(),
      myGrid: '',
      call: log.hisCall.toUpperCase(),
      grid: '',
      dialHz: hz,
      toneHz: 0,
      mode: log.mode.toUpperCase().includes('FT4') ? 'FT4' : 'FT8',
      rstSent: log.rstSent,
      rstRcvd: log.rstRecv,
      startedAt: endedAt,
      endedAt,
      notes: log.notes ?? '',
    }
  })
