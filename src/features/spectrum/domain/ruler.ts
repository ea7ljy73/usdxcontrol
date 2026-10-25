export const RULER_STEPS = [5_000, 2_500, 1_000, 500, 250, 200, 100, 50] as const

export type RulerTick = { freqHz: number; ratio: number }

export const rulerStep = (spanHz: number) => {
  for (const step of RULER_STEPS) {
    const count = spanHz / step
    if (count >= 8 && count <= 12) return step
  }
  return RULER_STEPS.reduce((best, step) =>
    Math.abs(spanHz / step - 10) < Math.abs(spanHz / best - 10) ? step : best,
  )
}

export const buildRulerTicks = (vfoHz: number, spanHz: number, stepHz: number): RulerTick[] => {
  const low = vfoHz - spanHz / 2
  const high = vfoHz + spanHz / 2
  const first = Math.ceil(low / stepHz) * stepHz
  const ticks: RulerTick[] = []
  for (let freq = first; freq <= high; freq += stepHz) {
    const ratio = (freq - low) / spanHz
    if (ratio > 0.02 && ratio < 0.98) ticks.push({ freqHz: Math.round(freq), ratio })
  }
  return ticks
}
