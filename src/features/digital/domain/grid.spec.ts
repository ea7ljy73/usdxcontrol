import { describe, expect, it } from 'vitest'
import { gridDistanceKm, gridToLatLng, greatCirclePath } from './grid'

describe('locator Maidenhead', () => {
  it('centro de una cuadrícula de 4 y 6 caracteres', () => {
    expect(gridToLatLng('IM76')).toEqual([36.5, -5])
    const [lat, lng] = gridToLatLng('JN11ck')!
    expect(lat).toBeCloseTo(41.44, 1)
    expect(lng).toBeCloseTo(2.21, 1)
  })

  it('rechaza lo que no es un locator', () => {
    expect(gridToLatLng('ZZ12')).toBeNull()
    expect(gridToLatLng('ab')).toBeNull()
  })

  it('distancia y ruta entre dos locators', () => {
    expect(gridDistanceKm('IM76', 'JN11')).toBeGreaterThan(800)
    expect(gridDistanceKm('IM76', 'XX')).toBeNull()
    const path = greatCirclePath([0, 0], [0, 90], 4)
    expect(path).toHaveLength(5)
    expect(path[2][1]).toBeCloseTo(45)
  })
})
