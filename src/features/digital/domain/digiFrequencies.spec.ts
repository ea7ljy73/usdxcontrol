import { describe, expect, it } from 'vitest'
import { digiDialHz } from './digiFrequencies'

describe('frecuencias FT8/FT4', () => {
  it('da la frecuencia de dial por banda y modo', () => {
    expect(digiDialHz('FT8', '40m')).toBe(7_074_000)
    expect(digiDialHz('FT4', '20m')).toBe(14_080_000)
  })

  it('null en bandas sin frecuencia asignada', () => {
    expect(digiDialHz('FT4', '160m')).toBeNull()
  })
})
