const STOPS: ReadonlyArray<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [10, 26, 72] },
  { at: 0.3, rgb: [8, 72, 176] },
  { at: 0.55, rgb: [0, 150, 215] },
  { at: 0.75, rgb: [55, 220, 140] },
  { at: 0.9, rgb: [235, 235, 90] },
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

export const paletteGrid = 'rgba(80, 120, 160, 0.28)'
export const paletteCenter = 'rgba(0, 200, 230, 0.75)'
export const paletteCurve = 'rgba(170, 245, 150, 0.95)'
export const paletteFill = 'rgba(40, 160, 110, 0.28)'
