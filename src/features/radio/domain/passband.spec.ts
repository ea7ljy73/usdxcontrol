import { describe, expect, it } from 'vitest'
import { audioViewFor, passbandFor, passbandWidthLabel } from './passband'

describe('passband', () => {
  it('coloca la banda lateral a cada lado del VFO', () => {
    expect(passbandFor('USB').lowHz).toBeGreaterThan(0)
    expect(passbandFor('LSB').highHz).toBeLessThan(0)
    expect(passbandFor('CW')).toEqual({ lowHz: -250, highHz: 250 })
  })

  it('etiqueta el ancho como el slice flag de SmartSDR', () => {
    expect(passbandWidthLabel('USB')).toBe('2.4K')
    expect(passbandWidthLabel('CW')).toBe('500')
    expect(passbandWidthLabel('AM')).toBe('6K')
    expect(passbandWidthLabel('FM')).toBe('12K')
  })
})

describe('audioViewFor', () => {
  it('indica a qué lado del dial cae el audio de cada modo', () => {
    expect(audioViewFor('USB')).toEqual({ sideband: 'upper', pivotHz: 0 })
    expect(audioViewFor('LSB')).toEqual({ sideband: 'lower', pivotHz: 0 })
    expect(audioViewFor('CW')).toEqual({ sideband: 'lower', pivotHz: 600 })
    expect(audioViewFor('AM')).toEqual({ sideband: 'double', pivotHz: 0 })
  })
})
