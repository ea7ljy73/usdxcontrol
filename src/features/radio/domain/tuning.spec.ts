import { describe, expect, it } from 'vitest'
import { formatStep, nextStepIndex, snapToStep, stepsFrom, TUNING_STEPS } from './tuning'

describe('tuning', () => {
  it('recorre los pasos de sintonización de forma circular', () => {
    expect(nextStepIndex(0)).toBe(1)
    expect(nextStepIndex(TUNING_STEPS.length - 1)).toBe(0)
  })

  it('formatea los pasos de forma legible', () => {
    expect(formatStep(10)).toBe('10 Hz')
    expect(formatStep(100)).toBe('100 Hz')
    expect(formatStep(1_000)).toBe('1k')
    expect(formatStep(100_000)).toBe('100k')
  })
})

describe('rejilla del paso de sintonía', () => {
  it('un paso desde fuera de la rejilla cae en ella', () => {
    expect(stepsFrom(7_074_350, 1, 1_000)).toBe(7_075_000)
    expect(stepsFrom(7_074_350, -1, 1_000)).toBe(7_074_000)
  })

  it('desde la rejilla avanza pasos enteros', () => {
    expect(stepsFrom(7_074_000, 1, 1_000)).toBe(7_075_000)
    expect(stepsFrom(7_074_000, -3, 1_000)).toBe(7_071_000)
    expect(stepsFrom(7_074_000, 10, 10_000)).toBe(7_170_000)
  })

  it('redondea al paso más cercano', () => {
    expect(snapToStep(7_074_499, 1_000)).toBe(7_074_000)
    expect(snapToStep(7_074_500, 1_000)).toBe(7_075_000)
    expect(snapToStep(7_074_356, 10)).toBe(7_074_360)
    expect(stepsFrom(7_074_356, 0, 100)).toBe(7_074_400)
  })
})
