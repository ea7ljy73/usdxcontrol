// Ciclos de transmisión: FT8 en ventanas de 15 s y FT4 de 7,5 s, alineadas con la
// hora UTC (FT8: 00, 15, 30 y 45 s de cada minuto).
export type DigiMode = 'FT8' | 'FT4'

export const DIGI_MODES: readonly DigiMode[] = ['FT8', 'FT4']

export const slotLengthMs = (mode: DigiMode): number => (mode === 'FT8' ? 15_000 : 7_500)

export const slotIndex = (epochMs: number, mode: DigiMode): number => Math.floor(epochMs / slotLengthMs(mode))

export const slotStartMs = (index: number, mode: DigiMode): number => index * slotLengthMs(mode)

// Fracción transcurrida del ciclo en curso (0..1).
export const slotProgress = (epochMs: number, mode: DigiMode): number => {
  const length = slotLengthMs(mode)
  return (((epochMs % length) + length) % length) / length
}

// Hora del ciclo como la muestra WSJT-X: hhmmss en UTC (FT4 cae en medios segundos y se trunca).
export const formatSlotUtc = (startMs: number): string => {
  const date = new Date(startMs)
  return [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join('')
}

// Secuencia de WSJT-X: "par" son los ciclos que empiezan en :00 y :30 (1.ª secuencia),
// "impar" los de :15 y :45. En FT4 alterna cada 7,5 s.
export type SlotParity = 'even' | 'odd'

export const slotParity = (index: number): SlotParity => (Math.abs(index) % 2 === 0 ? 'even' : 'odd')

export const oppositeParity = (parity: SlotParity): SlotParity => (parity === 'even' ? 'odd' : 'even')

// La emisión FT8 empieza medio segundo después del inicio del ciclo (DT = 0) y,
// si se llega tarde, aún se admite arrancar hasta 1,5 s más tarde.
export const TX_START_OFFSET_MS = 500
export const TX_LATE_LIMIT_MS = 2_000

// Siguiente ciclo propio en el que aún se puede empezar a transmitir.
export const nextTxSlot = (nowMs: number, mode: DigiMode, parity: SlotParity): number => {
  const current = slotIndex(nowMs, mode)
  const late = nowMs - slotStartMs(current, mode)
  if (slotParity(current) === parity && late <= TX_LATE_LIMIT_MS) return current
  return slotParity(current + 1) === parity ? current + 1 : current + 2
}
