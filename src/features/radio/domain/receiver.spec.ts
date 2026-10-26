import { describe, expect, it } from 'vitest'
import { agcName, clampAgcLevel, clampNr, clampVolume, meterForS, meterPercent, meterRatio, nextAgc, nextNr, sUnitLabel } from './receiver'

describe('ajustes de receptor', () => {
  it('recorta volumen y NR a sus rangos', () => {
    expect(clampVolume(-5)).toBe(0)
    expect(clampVolume(10)).toBe(10)
    expect(clampVolume(120)).toBe(16)
    expect(clampNr(7)).toBe(7)
    expect(clampNr(12)).toBe(8)
    expect(clampNr(-1)).toBe(0)
  })

  it('agc del uSDX (OFF, FAST, SLOW), FAST ante valores inválidos', () => {
    expect(clampAgcLevel(0)).toBe(0)
    expect(clampAgcLevel(2)).toBe(2)
    expect(clampAgcLevel(3)).toBe(1)
    expect(clampAgcLevel(NaN)).toBe(1)
    expect(agcName(0)).toBe('OFF')
    expect(agcName(1)).toBe('FAST')
    expect(agcName(2)).toBe('SLOW')
  })

  it('traduce el S-meter del CAT (S9 = 15, 4 dB por cuenta) a unidades S', () => {
    expect(sUnitLabel(0)).toBe('S1')
    expect(sUnitLabel(6)).toBe('S3')
    expect(sUnitLabel(14)).toBe('S8')
    expect(sUnitLabel(15)).toBe('S9')
    expect(sUnitLabel(20)).toBe('S9+20')
    expect(sUnitLabel(30)).toBe('S9+60')
  })

  it('NR y AGC avanzan al siguiente nivel y vuelven al primero', () => {
    expect(nextNr(null)).toBe(1)
    expect(nextNr(3)).toBe(4)
    expect(nextNr(8)).toBe(0)
    expect(nextAgc(0)).toBe(1)
    expect(nextAgc(2)).toBe(0)
    expect(nextAgc(null)).toBe(2)
  })

  it('sitúa las marcas S en la escala del CAT', () => {
    expect(meterForS(9)).toBe(15)
    expect(meterForS(1)).toBe(3)
    expect(meterForS(9, 20)).toBe(20)
    expect(meterRatio(meterForS(9))).toBe(0.5)
    expect(meterRatio(99)).toBe(1)
  })

  it('convierte el S-meter (0..30) a porcentaje', () => {
    expect(meterPercent(0)).toBe(0)
    expect(meterPercent(30)).toBe(100)
    expect(meterPercent(15)).toBe(50)
    expect(meterPercent(99)).toBe(100)
  })
})
