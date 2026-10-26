import type { SpectrumFrame } from '../application/ports'

// Margen del pico sobre el ruido para considerar que hay señal. Con el suavizado del
// analizador, el ruido solo rara vez pasa de ~8 dB sobre su mediana.
export const SIGNAL_THRESHOLD_DB = 15

// Cuánto sobresale lo más fuerte del pasabanda sobre el ruido del propio pasabanda
// (su mediana). Se mide dentro del filtro porque fuera la radio ya atenúa el audio
// y un suelo tomado ahí haría pasar por señal el simple ruido de banda.
export const passbandSnrDb = (frame: SpectrumFrame, [loHz, hiHz]: [number, number]): number | null => {
  if (frame.kind !== 'audio') return null
  const from = Math.max(0, Math.ceil(loHz / frame.binHz))
  const to = Math.min(frame.bins.length - 1, Math.floor(hiHz / frame.binHz))
  if (to - from < 4) return null
  const levels = Array.from(frame.bins.subarray(from, to + 1)).filter(Number.isFinite)
  if (levels.length < 5) return null
  levels.sort((a, b) => a - b)
  const median = levels[Math.floor(levels.length / 2)]
  return levels[levels.length - 1] - median
}

export const hasSignal = (frame: SpectrumFrame | null | undefined, passbandHz: [number, number] | null): boolean => {
  if (!frame || passbandHz === null) return false
  const snr = passbandSnrDb(frame, passbandHz)
  return snr !== null && snr >= SIGNAL_THRESHOLD_DB
}
