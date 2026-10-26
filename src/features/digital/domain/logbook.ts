import type { DigiMode } from './slots'

// QSO guardado en el libro de guardia local.
export type LogEntry = {
  id: string
  myCall: string
  myGrid: string
  call: string
  grid: string
  dialHz: number
  // Tono de audio de la emisión: la frecuencia real es dial + tono.
  toneHz: number
  mode: DigiMode
  rstSent: string
  rstRcvd: string
  startedAt: string
  // Fecha y hora UTC de fin (ISO).
  endedAt: string
  notes: string
}

export const rfMhz = (entry: Pick<LogEntry, 'dialHz' | 'toneHz'>): string => ((entry.dialHz + entry.toneHz) / 1e6).toFixed(6)

// Como WSJT-X: país nunca trabajado, indicativo nuevo de un país ya trabajado o ya trabajado.
export type WorkedStatus = 'new-country' | 'new-call' | 'worked'

export const workedIndex = (entries: Pick<LogEntry, 'call'>[], countryOf: (call: string) => string | null) => {
  const calls = new Set(entries.map((entry) => entry.call.toUpperCase()))
  const countries = new Set(entries.map((entry) => countryOf(entry.call)).filter((country): country is string => !!country))
  return (call: string): WorkedStatus => {
    const upper = call.toUpperCase()
    if (calls.has(upper)) return 'worked'
    const country = countryOf(upper)
    return country && !countries.has(country) ? 'new-country' : 'new-call'
  }
}
