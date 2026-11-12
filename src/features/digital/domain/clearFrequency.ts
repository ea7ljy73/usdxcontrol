import type { DigiDecode } from './decodeList'
import type { DigiMode } from './slots'

// Ancho de la señal sobre su tono base (8 tonos de 6,25 Hz en FT8, 4 de 20,8 Hz en FT4).
export const SIGNAL_WIDTH_HZ: Record<DigiMode, number> = { FT8: 50, FT4: 83 }

// Lo que se mira hacia atrás: las estaciones van y vienen, pero suelen repetir frecuencia.
export const CLEAR_LOOKBACK_MS = 3 * 60_000
// A partir de esta separación con la señal más cercana ya se considera hueco limpio: con
// la banda llena no hay más, y exigir más empuja el TX a los bordes, que están vacíos
// justo porque ahí los filtros de los receptores ya recortan.
export const CLEAR_GAP_HZ = 30
const STEP_HZ = 5

export type ClearFrequency = { hz: number; gapHz: number; busy: number }

type Options = {
  decodes: readonly DigiDecode[]
  mode: DigiMode
  nowMs: number
  // Tono actual: entre huecos igual de buenos, el más cercano (no se salta de lado a lado).
  currentHz: number
  // Por debajo de 500 Hz muchos receptores ya recortan, y el uSDX no emite por encima de 2400 Hz
  // (muestrea el audio de TX a 4800 Hz): la señal entera tiene que caber en 500–2350 Hz.
  minHz?: number
  maxHz?: number
}

// Busca un tono de TX lejos de lo decodificado en los últimos minutos, como se hace a
// ojo en la cascada de WSJT-X: el que deja más separación con la señal más próxima.
export const findClearFrequency = ({ decodes, mode, nowMs, currentHz, minHz = 500, maxHz = 2_350 }: Options): ClearFrequency => {
  const width = SIGNAL_WIDTH_HZ[mode]
  const busy = decodes
    .filter((decode) => !decode.tx && decode.mode === mode && nowMs - decode.slotStartMs <= CLEAR_LOOKBACK_MS)
    .map((decode) => decode.audioHz)
  const top = maxHz - width
  const gapAt = (hz: number) => {
    let gap = Infinity
    for (const other of busy) {
      // Separación entre [hz, hz + ancho] y [other, other + ancho]; negativa si se pisan.
      const separation = Math.max(other - (hz + width), hz - (other + width))
      if (separation < gap) gap = separation
    }
    return gap
  }
  // El tono actual compite como uno más: si ya está limpio no se mueve ni un hercio.
  const candidates = [Math.round(currentHz)]
  for (let hz = minHz; hz <= top; hz += STEP_HZ) candidates.push(hz)
  let best = { hz: candidates[0], gap: -Infinity, score: -Infinity }
  for (const hz of candidates) {
    if (hz < minHz || hz > top) continue
    const gap = gapAt(hz)
    // Primero la separación (hasta la suficiente) y, a igualdad, lo más cerca del tono actual.
    const score = Math.min(gap, CLEAR_GAP_HZ) * 10_000 - Math.abs(hz - currentHz)
    if (score > best.score) best = { hz, gap, score }
  }
  if (best.score === -Infinity) best = { hz: Math.round(Math.min(top, Math.max(minHz, currentHz))), gap: gapAt(currentHz), score: 0 }
  return { hz: best.hz, gapHz: Number.isFinite(best.gap) ? Math.round(best.gap) : Infinity, busy: busy.length }
}
