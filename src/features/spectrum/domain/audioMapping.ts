// El panadaptador no ve RF: ve el audio ya demodulado por la radio. Cada modo
// traslada RF a audio de una forma, y esto deshace esa traslación para colocar
// cada frecuencia de audio en su sitio respecto al dial.
//
// - upper: audio = rf - dial - pivot (USB)
// - lower: audio = dial + pivot - rf (LSB, y CW con pivot = tono CW)
// - double: audio = |rf - dial - pivot| (AM/FM: las dos bandas laterales son espejo)
export type AudioSideband = 'upper' | 'lower' | 'double'

export type AudioView = {
  sideband: AudioSideband
  pivotHz: number
}

// Ancho de audio útil de la radio: por encima solo hay ruido del filtro.
export const AUDIO_LIMIT_HZ = 4_000

export const audioHzAt = (offsetHz: number, view: AudioView): number | null => {
  const shifted = offsetHz - view.pivotHz
  const audio = view.sideband === 'upper' ? shifted : view.sideband === 'lower' ? -shifted : Math.abs(shifted)
  return audio >= 0 && audio <= AUDIO_LIMIT_HZ ? audio : null
}

// Tramo de audio [lo, hi] que cae entre dos desplazamientos de RF respecto al dial
// (una columna de píxeles), o null si la columna no tiene audio.
export const audioRangeBetween = (fromOffsetHz: number, toOffsetHz: number, view: AudioView): [number, number] | null => {
  const s0 = Math.min(fromOffsetHz, toOffsetHz) - view.pivotHz
  const s1 = Math.max(fromOffsetHz, toOffsetHz) - view.pivotHz
  let lo: number
  let hi: number
  if (view.sideband === 'upper') {
    lo = s0
    hi = s1
  } else if (view.sideband === 'lower') {
    lo = -s1
    hi = -s0
  } else {
    lo = s0 <= 0 && s1 >= 0 ? 0 : Math.min(Math.abs(s0), Math.abs(s1))
    hi = Math.max(Math.abs(s0), Math.abs(s1))
  }
  lo = Math.max(0, lo)
  hi = Math.min(AUDIO_LIMIT_HZ, hi)
  return hi >= lo ? [lo, hi] : null
}
