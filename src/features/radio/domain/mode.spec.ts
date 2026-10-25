import { describe, expect, it } from 'vitest'
import { modeFromCatDigit, modeToCatDigit, type RadioMode } from './mode'

const MODES = ['LSB', 'USB', 'CW', 'FM', 'AM'] as const

describe('mode', () => {
  it('codifica a dígito CAT como hace el firmware (mode + 1)', () => {
    expect(modeToCatDigit('LSB')).toBe(1)
    expect(modeToCatDigit('USB')).toBe(2)
    expect(modeToCatDigit('CW')).toBe(3)
    expect(modeToCatDigit('FM')).toBe(4)
    expect(modeToCatDigit('AM')).toBe(5)
  })

  it('decodifica con el mismo clamp del firmware (Command_SetMD)', () => {
    for (let digit = 1; digit <= 5; digit++) {
      expect(modeFromCatDigit(digit)).toBe<RadioMode>(MODES[digit - 1])
    }
    expect(modeFromCatDigit(0)).toBe<RadioMode>('LSB')
    expect(modeFromCatDigit(9)).toBe<RadioMode>('AM')
  })
})
