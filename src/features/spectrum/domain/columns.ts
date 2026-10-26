import type { SpectrumFrame } from '../application/ports'
import { audioRangeBetween, type AudioView } from './audioMapping'

export type ColumnView = {
  leftHz: number
  spanHz: number
  vfoHz: number
  audio: AudioView
}

// Nivel en dB de cada columna de la vista: pico de los bins que caen en ella,
// o interpolación si la columna es más estrecha que un bin. NaN = sin datos.
export const frameColumns = (frame: SpectrumFrame, view: ColumnView, width: number): Float32Array => {
  const { bins, binHz } = frame
  const lastBin = bins.length - 1
  const hzPerColumn = view.spanHz / width
  const levels = new Float32Array(width)

  for (let x = 0; x < width; x++) {
    const fromHz = view.leftHz + x * hzPerColumn
    let lo: number
    let hi: number
    if (frame.kind === 'audio') {
      const range = audioRangeBetween(fromHz - view.vfoHz, fromHz + hzPerColumn - view.vfoHz, view.audio)
      if (range === null) {
        levels[x] = Number.NaN
        continue
      }
      lo = range[0] / binHz
      hi = range[1] / binHz
    } else {
      lo = (fromHz - frame.startHz) / binHz
      hi = (fromHz + hzPerColumn - frame.startHz) / binHz
    }
    if (hi < 0 || lo > lastBin) {
      levels[x] = Number.NaN
      continue
    }
    lo = Math.max(0, lo)
    hi = Math.min(lastBin, hi)
    if (hi - lo < 1) {
      const position = (lo + hi) / 2
      const lower = Math.floor(position)
      const a = bins[lower]
      const b = bins[Math.min(lastBin, lower + 1)]
      levels[x] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * (position - lower) : a
    } else {
      let peak = Number.NEGATIVE_INFINITY
      for (let bin = Math.floor(lo); bin <= Math.ceil(hi); bin++) peak = Math.max(peak, bins[bin])
      levels[x] = peak
    }
  }
  return levels
}
