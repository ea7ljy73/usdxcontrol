// Reloj UTC de los modos digitales: el del ordenador corregido con el desfase medido
// contra un servidor de hora. FT8 tolera ±1 s; más allá no se decodifica bien.
export const CLOCK_TOLERANCE_MS = 1_000

export const createDigiClock = (localNow: () => number = Date.now) => {
  let offsetMs = 0
  return {
    now: () => localNow() + offsetMs,
    toLocal: (utcMs: number) => utcMs - offsetMs,
    offsetMs: () => offsetMs,
    setOffset: (value: number) => {
      offsetMs = value
    },
  }
}

export type DigiClock = ReturnType<typeof createDigiClock>

// Desfase entre la hora del servidor y la local, compensando la mitad del viaje de ida y vuelta.
export const measureOffset = (serverUtcMs: number, sentAtMs: number, receivedAtMs: number): number =>
  Math.round(serverUtcMs + (receivedAtMs - sentAtMs) / 2 - receivedAtMs)
