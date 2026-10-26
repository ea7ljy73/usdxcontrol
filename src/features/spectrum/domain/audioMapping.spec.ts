import { describe, expect, it } from 'vitest'
import { AUDIO_LIMIT_HZ, audioHzAt, audioRangeBetween } from './audioMapping'

describe('audioMapping', () => {
  it('USB: el audio crece por encima del dial y no hay audio por debajo', () => {
    const usb = { sideband: 'upper', pivotHz: 0 } as const
    expect(audioHzAt(1_500, usb)).toBe(1_500)
    expect(audioHzAt(0, usb)).toBe(0)
    expect(audioHzAt(-200, usb)).toBeNull()
    expect(audioHzAt(AUDIO_LIMIT_HZ + 100, usb)).toBeNull()
  })

  it('LSB: el audio crece por debajo del dial', () => {
    const lsb = { sideband: 'lower', pivotHz: 0 } as const
    expect(audioHzAt(-1_500, lsb)).toBe(1_500)
    expect(audioHzAt(200, lsb)).toBeNull()
  })

  it('CW: una portadora en el dial suena al tono CW (RX en LSB con LO = dial + tono)', () => {
    const cw = { sideband: 'lower', pivotHz: 600 } as const
    expect(audioHzAt(0, cw)).toBe(600)
    expect(audioHzAt(100, cw)).toBe(500)
    expect(audioHzAt(-100, cw)).toBe(700)
  })

  it('AM: las dos bandas laterales caen en la misma frecuencia de audio', () => {
    const am = { sideband: 'double', pivotHz: 0 } as const
    expect(audioHzAt(-1_000, am)).toBe(1_000)
    expect(audioHzAt(1_000, am)).toBe(1_000)
  })

  it('da el tramo de audio de una columna ancha, recortado a lo que hay', () => {
    const usb = { sideband: 'upper', pivotHz: 0 } as const
    expect(audioRangeBetween(1_000, 1_300, usb)).toEqual([1_000, 1_300])
    expect(audioRangeBetween(-200, 150, usb)).toEqual([0, 150])
    expect(audioRangeBetween(-500, -100, usb)).toBeNull()
    expect(audioRangeBetween(3_900, 4_400, usb)).toEqual([3_900, AUDIO_LIMIT_HZ])
    const lsb = { sideband: 'lower', pivotHz: 0 } as const
    expect(audioRangeBetween(-1_300, -1_000, lsb)).toEqual([1_000, 1_300])
    const am = { sideband: 'double', pivotHz: 0 } as const
    expect(audioRangeBetween(-300, 200, am)).toEqual([0, 300])
  })
})
