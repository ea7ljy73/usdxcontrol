import { describe, expect, it } from 'vitest'
import { agcName, clampAgcLevel, clampNr, clampVolume, meterPercent, sUnitLabel } from './receiver'

describe('ajustes de receptor', () => {
  it('recorta volumen y NR a sus rangos', () => {
    expect(clampVolume(-5)).toBe(0)
    expect(clampVolume(50)).toBe(50)
    expect(clampVolume(120)).toBe(99)
    expect(clampNr(7)).toBe(4)
    expect(clampNr(-1)).toBe(0)
  })

  it('agc por defecto AUTO ante valores inválidos', () => {
    expect(clampAgcLevel(0)).toBe(0)
    expect(clampAgcLevel(3)).toBe(3)
    expect(clampAgcLevel(9)).toBe(1)
    expect(clampAgcLevel(NaN)).toBe(1)
    expect(agcName(0)).toBe('OFF')
    expect(agcName(1)).toBe('AUTO')
  })

  it('traduce el nivel del medidor a unidades S', () => {
    expect(sUnitLabel(0)).toBe('S1')
    expect(sUnitLabel(60)).toBe('S4')
    expect(sUnitLabel(135)).toBe('S8')
    expect(sUnitLabel(140)).toBe('S9')
    expect(sUnitLabel(200)).toBe('S9+20')
    expect(sUnitLabel(255)).toBe('S9+40')
  })

  it('convierte el nivel bruto a porcentaje', () => {
    expect(meterPercent(0)).toBe(0)
    expect(meterPercent(255)).toBe(100)
    expect(meterPercent(127)).toBe(50)
    expect(meterPercent(999)).toBe(100)
  })
})
