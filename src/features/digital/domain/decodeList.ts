import { parseFt8, type Ft8Parsed } from './ft8msg'
import type { DigiMode } from './slots'

// Lo que entrega el decodificador: SNR (dB), desfase de tiempo (s), tono de audio (Hz) y texto.
export type RawDecode = { db: number; dt: number; df: number; text: string }

export type DigiDecode = {
  id: string
  mode: DigiMode
  slotStartMs: number
  snrDb: number
  dtS: number
  audioHz: number
  text: string
  parsed: Ft8Parsed | null
  // Eco de lo que hemos transmitido nosotros (no es una señal recibida).
  tx?: boolean
}

export const MAX_DECODES = 300

// Añade los decodificados de un ciclo: el ciclo más reciente arriba y, dentro de él,
// ordenados por tono como la "Band Activity" de WSJT-X. Se descartan los repetidos.
export const addSlotDecodes = (
  list: readonly DigiDecode[],
  raw: readonly RawDecode[],
  mode: DigiMode,
  slotStartMs: number,
): DigiDecode[] => {
  const seen = new Set<string>()
  const fresh: DigiDecode[] = []
  for (const decode of [...raw].sort((a, b) => a.df - b.df)) {
    const text = decode.text.trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    fresh.push({
      id: `${slotStartMs}-${fresh.length}`,
      mode,
      slotStartMs,
      snrDb: Math.round(decode.db),
      dtS: Math.round(decode.dt * 10) / 10,
      audioHz: Math.round(decode.df),
      text,
      parsed: parseFt8(text),
    })
  }
  const older = list.filter((decode) => decode.slotStartMs !== slotStartMs || decode.tx)
  return [...fresh, ...older].slice(0, MAX_DECODES)
}

// Lo transmitido aparece en la lista como en WSJT-X, en su ciclo y con su tono.
export const addTxEcho = (
  list: readonly DigiDecode[],
  message: string,
  mode: DigiMode,
  slotStartMs: number,
  toneHz: number,
): DigiDecode[] => {
  const echo: DigiDecode = {
    id: `${slotStartMs}-tx`,
    mode,
    slotStartMs,
    snrDb: 0,
    dtS: 0,
    audioHz: toneHz,
    text: message,
    parsed: parseFt8(message),
    tx: true,
  }
  return [echo, ...list.filter((decode) => decode.id !== echo.id)].slice(0, MAX_DECODES)
}

// Ancho de una señal FT8 (8 tonos de 6,25 Hz): lo que cae dentro es "nuestra frecuencia".
export const RX_TOLERANCE_HZ = 50

// Panel "Rx Frequency" de WSJT-X: lo que se oye en nuestra frecuencia de RX, lo que nos
// envían a nosotros, lo de la estación DX y nuestras propias emisiones.
export const rxFrequencyDecodes = (
  decodes: DigiDecode[],
  { rxHz, myCall, dxCall }: { rxHz: number; myCall: string; dxCall: string },
): DigiDecode[] => {
  const me = myCall.trim().toUpperCase()
  const dx = dxCall.trim().toUpperCase()
  return decodes.filter(
    (decode) =>
      decode.tx ||
      Math.abs(decode.audioHz - rxHz) <= RX_TOLERANCE_HZ ||
      (me !== '' && decode.parsed?.toCall === me) ||
      (dx !== '' && decode.parsed?.fromCall === dx),
  )
}
