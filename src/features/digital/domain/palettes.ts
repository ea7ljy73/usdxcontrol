// Paletas de waterfall estilo SDR (LUT RGB de 256 entradas) para la cascada FT8
// (copiadas de radiocq).
export function makePalette(stops: [number, number, number][]): Uint8Array<ArrayBuffer> {
  const lut = new Uint8Array(256 * 3)
  const seg = stops.length - 1
  for (let i = 0; i < 256; i++) {
    const p = (i / 255) * seg
    const s = Math.min(seg - 1, Math.floor(p))
    const f = p - s
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(stops[s][c] + (stops[s + 1][c] - stops[s][c]) * f)
  }
  return lut
}

export const WATERFALL_PALETTES: Record<string, Uint8Array<ArrayBuffer>> = {
  clasico: makePalette([[2, 6, 23], [10, 22, 64], [26, 46, 130], [72, 42, 150], [160, 48, 96], [228, 92, 28], [255, 182, 24], [255, 255, 214]]),
  espectro: makePalette([[4, 8, 26], [18, 22, 84], [10, 92, 142], [16, 162, 120], [140, 212, 44], [252, 255, 190]]),
  fuego: makePalette([[3, 3, 10], [62, 10, 12], [172, 32, 14], [255, 122, 12], [255, 232, 92], [255, 255, 232]]),
  mono: makePalette([[2, 6, 23], [10, 54, 38], [26, 124, 68], [110, 216, 116], [236, 255, 238]]),
}
