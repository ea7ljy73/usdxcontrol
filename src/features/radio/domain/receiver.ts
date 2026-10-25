export const AGC_LEVELS = ['OFF', 'AUTO', 'FAST', 'SLOW'] as const
export type AgcLevel = 0 | 1 | 2 | 3
export type AgcName = (typeof AGC_LEVELS)[AgcLevel]

export const MAX_VOLUME = 99
export const MAX_NR = 4

export const clampVolume = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_VOLUME, Math.max(0, Math.round(value))) : MAX_VOLUME

export const clampNr = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_NR, Math.max(0, Math.round(value))) : 0

export const clampAgcLevel = (value: number): AgcLevel => {
  const rounded = Math.round(value)
  if (rounded < 0 || rounded > 3 || !Number.isFinite(value)) return 1
  return rounded as AgcLevel
}

export const agcName = (level: AgcLevel): AgcName => AGC_LEVELS[level]

export const sUnitLabel = (raw: number): string => {
  const level = Math.max(0, Math.min(255, Math.round(raw)))
  if (level < 136) {
    return `S${Math.max(1, Math.ceil((Math.max(1, level) / 135) * 8))}`
  }
  const over = Math.round(((level - 136) / 119) * 4) * 10
  return over <= 0 ? 'S9' : `S9+${over}`
}

export const meterPercent = (raw: number): number =>
  Math.max(0, Math.min(100, Math.round((Math.max(0, Math.min(255, raw)) / 255) * 100)))
