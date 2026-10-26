import type { RadioMode } from './mode'

export type Passband = { lowHz: number; highHz: number }

// Filtros por defecto del uSDX respecto al VFO: SSB de 2,4 kHz por encima o por debajo,
// CW centrado de 500 Hz y AM/FM simétricos.
const PASSBANDS: Record<RadioMode, Passband> = {
  LSB: { lowHz: -2_700, highHz: -300 },
  USB: { lowHz: 300, highHz: 2_700 },
  CW: { lowHz: -250, highHz: 250 },
  AM: { lowHz: -3_000, highHz: 3_000 },
  FM: { lowHz: -6_000, highHz: 6_000 },
}

export const passbandFor = (mode: RadioMode): Passband => PASSBANDS[mode]

export const passbandWidthLabel = (mode: RadioMode): string => {
  const { lowHz, highHz } = PASSBANDS[mode]
  const width = highHz - lowHz
  return width >= 1_000 ? `${(width / 1_000).toFixed(1).replace(/\.0$/, '')}K` : String(width)
}

// Tono CW por defecto del firmware (tones[cw_tone], cw_tone = 1 → 600 Hz). En CW el
// uSDX recibe en LSB con el LO en dial + tono, así que una portadora en el dial suena a 600 Hz.
export const CW_TONE_HZ = 600

export type ModeAudioView = {
  sideband: 'upper' | 'lower' | 'double'
  pivotHz: number
}

const AUDIO_VIEWS: Record<RadioMode, ModeAudioView> = {
  USB: { sideband: 'upper', pivotHz: 0 },
  LSB: { sideband: 'lower', pivotHz: 0 },
  CW: { sideband: 'lower', pivotHz: CW_TONE_HZ },
  AM: { sideband: 'double', pivotHz: 0 },
  FM: { sideband: 'double', pivotHz: 0 },
}

export const audioViewFor = (mode: RadioMode): ModeAudioView => AUDIO_VIEWS[mode]
