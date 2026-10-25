export const MIN_FREQUENCY_HZ = 100_000
export const MAX_FREQUENCY_HZ = 60_000_000

export type Frequency = number

export function clampFrequency(value: number): Frequency {
  return Math.min(MAX_FREQUENCY_HZ, Math.max(MIN_FREQUENCY_HZ, Math.round(value)))
}

export function formatFrequencyDigits(frequency: number): string {
  return clampFrequency(frequency).toString().padStart(11, '0')
}

export function parseFrequencyDigits(digits: string): Frequency {
  const value = Number.parseInt(digits, 10)
  if (!Number.isFinite(value)) return clampFrequency(MIN_FREQUENCY_HZ)
  return clampFrequency(value)
}

export function formatFrequency(frequency: number): string {
  const hz = clampFrequency(frequency)
  return hz.toLocaleString('en-US').replace(/,/g, '.')
}
