const STOPS: ReadonlyArray<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [14, 30, 128] },
  { at: 0.3, rgb: [22, 62, 205] },
  { at: 0.5, rgb: [0, 140, 230] },
  { at: 0.68, rgb: [40, 220, 170] },
  { at: 0.82, rgb: [130, 240, 60] },
  { at: 0.93, rgb: [245, 240, 70] },
  { at: 1, rgb: [255, 255, 255] },
]

export type Rgb = [number, number, number]

export const paletteBackground = (): Rgb => [...STOPS[0].rgb]

export const intensityColor = (value: number): Rgb => {
  const v = Math.min(1, Math.max(0, value))
  const upper = STOPS.findIndex((stop) => stop.at >= v)
  if (upper <= 0) return [...STOPS[0].rgb]
  const from = STOPS[upper - 1]
  const to = STOPS[upper]
  const span = to.at - from.at
  const k = span <= 0 ? 0 : (v - from.at) / span
  return [
    Math.round(from.rgb[0] + (to.rgb[0] - from.rgb[0]) * k),
    Math.round(from.rgb[1] + (to.rgb[1] - from.rgb[1]) * k),
    Math.round(from.rgb[2] + (to.rgb[2] - from.rgb[2]) * k),
  ]
}

export const panBackground = 'rgb(16 44 66)'
export const paletteGrid = 'rgba(120, 165, 205, 0.26)'
export const noAudioShade = 'rgba(0, 0, 0, 0.3)'
export const outOfBandShade = 'rgba(0, 0, 0, 0.45)'
export const paletteCurve = 'rgba(170, 250, 120, 0.9)'

// Relleno del espectro de abajo (0) arriba (1), como en SmartSDR: azul en el fondo,
// cian y verde en el suelo de ruido y amarillo en las señales fuertes.
export const SPECTRUM_FILL: ReadonlyArray<[number, string]> = [
  [0, 'rgb(28 52 175)'],
  [0.09, 'rgb(30 105 225)'],
  [0.16, 'rgb(40 195 215)'],
  [0.23, 'rgb(105 235 90)'],
  [0.55, 'rgb(175 245 70)'],
  [1, 'rgb(250 250 140)'],
]
