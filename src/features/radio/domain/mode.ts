export const RADIO_MODES = ['LSB', 'USB', 'CW', 'FM', 'AM'] as const

export type RadioMode = (typeof RADIO_MODES)[number]

export type CatModeDigit = 1 | 2 | 3 | 4 | 5

export function modeToCatDigit(mode: RadioMode): CatModeDigit {
  const index = RADIO_MODES.indexOf(mode)
  if (index < 0) throw new Error(`Modo desconocido: ${mode}`)
  return (index + 1) as CatModeDigit
}

export function modeFromCatDigit(digit: number): RadioMode {
  if (digit < 1) return 'LSB'
  if (digit > 5) return 'AM'
  return RADIO_MODES[digit - 1]
}
