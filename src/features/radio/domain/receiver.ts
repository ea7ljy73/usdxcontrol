// Rangos del menú del uSDX (firmware v2.2.0): Volume 0..16, AGC OFF/Fast/Slow, NR 0..8.
export const AGC_LEVELS = ['OFF', 'FAST', 'SLOW'] as const
export type AgcLevel = 0 | 1 | 2
export type AgcName = (typeof AGC_LEVELS)[AgcLevel]

export const MAX_VOLUME = 16
export const MAX_NR = 8
// S-meter por CAT: 0..30, S9 (-73 dBm) = 15 y 4 dB por cuenta.
export const MAX_METER = 30
const S9_METER = 15
const DB_PER_METER_STEP = 4

export const clampVolume = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_VOLUME, Math.max(0, Math.round(value))) : MAX_VOLUME

export const clampNr = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_NR, Math.max(0, Math.round(value))) : 0

export const clampAgcLevel = (value: number): AgcLevel => {
  const rounded = Math.round(value)
  if (rounded < 0 || rounded > 2 || !Number.isFinite(value)) return 1
  return rounded as AgcLevel
}

export const agcName = (level: AgcLevel): AgcName => AGC_LEVELS[level]

// Pulsar NR o AGC avanza al siguiente nivel y, tras el último, vuelve al primero.
export const nextNr = (current: number | null): number => ((current ?? 0) >= MAX_NR ? 0 : clampNr((current ?? 0) + 1))
export const nextAgc = (current: number | null): AgcLevel => (((clampAgcLevel(current ?? 1) + 1) % AGC_LEVELS.length) as AgcLevel)

// Refresco del S-meter: cada lectura por CAT se oye como un chasquido en el uSDX.
export const METER_RATES = [
  { id: 'lento', label: 'Lento', ms: 6_000 },
  { id: 'normal', label: 'Normal', ms: 1_000 },
  { id: 'rapido', label: 'Rápido', ms: 500 },
] as const
export type MeterRate = (typeof METER_RATES)[number]['id']
export const meterRateOf = (id: MeterRate) => METER_RATES.find((rate) => rate.id === id) ?? METER_RATES[1]
export const nextMeterRate = (id: MeterRate): MeterRate =>
  METER_RATES[(METER_RATES.indexOf(meterRateOf(id)) + 1) % METER_RATES.length].id

// Posición (0..1) de un nivel del S-meter en la barra.
export const meterRatio = (raw: number): number => Math.max(0, Math.min(MAX_METER, raw)) / MAX_METER
// Nivel del S-meter para una unidad S (1..9) o para S9 + dB.
export const meterForS = (sUnit: number, overDb = 0): number => S9_METER + ((sUnit - 9) * 6 + overDb) / DB_PER_METER_STEP

// Una unidad S son 6 dB.
export const sUnitLabel = (raw: number): string => {
  const db = (Math.max(0, Math.min(MAX_METER, Math.round(raw))) - S9_METER) * DB_PER_METER_STEP
  if (db < 0) return `S${Math.max(1, Math.round(9 + db / 6))}`
  const over = Math.round(db / 10) * 10
  return over <= 0 ? 'S9' : `S9+${over}`
}

export const meterPercent = (raw: number): number =>
  Math.max(0, Math.min(100, Math.round((Math.max(0, Math.min(MAX_METER, raw)) / MAX_METER) * 100)))
