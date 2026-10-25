export const TUNING_STEPS = [10, 100, 500, 1_000, 10_000, 100_000] as const

export type TuningStep = (typeof TUNING_STEPS)[number]

export const nextStepIndex = (index: number): number => (index + 1) % TUNING_STEPS.length

export const formatStep = (step: number): string =>
  step < 1_000 ? `${step} Hz` : `${step / 1_000}k`
