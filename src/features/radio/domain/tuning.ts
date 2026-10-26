export const TUNING_STEPS = [10, 100, 500, 1_000, 10_000, 100_000] as const

export type TuningStep = (typeof TUNING_STEPS)[number]

export const nextStepIndex = (index: number): number => (index + 1) % TUNING_STEPS.length

export const formatStep = (step: number): string =>
  step < 1_000 ? `${step} Hz` : `${step / 1_000}k`

// La sintonía se mueve por la rejilla del paso: con 1k, de 7.074.350 un paso arriba
// es 7.075.000 y uno abajo 7.074.000, nunca 7.075.350.
export const stepsFrom = (hz: number, steps: number, step: number): number => {
  if (steps === 0) return snapToStep(hz, step)
  const base = steps > 0 ? Math.floor(hz / step) * step : Math.ceil(hz / step) * step
  return base + steps * step
}

export const snapToStep = (hz: number, step: number): number => Math.round(hz / step) * step
