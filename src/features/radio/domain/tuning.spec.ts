import { describe, expect, it } from 'vitest'
import { formatStep, nextStepIndex, TUNING_STEPS } from './tuning'

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
