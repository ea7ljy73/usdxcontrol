import { describe, expect, it } from 'vitest'
import type { SpectrumFrame } from '../application/ports'
import { frameColumns } from './columns'

const usb = { sideband: 'upper', pivotHz: 0 } as const

const audioFrame = (peakAudioHz: number): SpectrumFrame => {
  const bins = new Float32Array(400).fill(-100)
  bins[Math.round(peakAudioHz / 10)] = -30
  return { kind: 'audio', binHz: 10, bins }
}

describe('frameColumns', () => {
  it('coloca el audio USB a la derecha del dial y deja sin datos el lado opuesto', () => {
    // Vista de 10 kHz centrada en el dial, 10 columnas de 1 kHz.
    const view = { leftHz: 7_069_000, spanHz: 10_000, vfoHz: 7_074_000, audio: usb }
    const levels = frameColumns(audioFrame(1_500), view, 10)
    expect(Number.isNaN(levels[0])).toBe(true)
    expect(Number.isNaN(levels[3])).toBe(true)
    expect(levels[6]).toBe(-30)
    expect(levels[5]).toBe(-100)
  })

  it('con una columna más ancha que un bin se queda con el pico', () => {
    const view = { leftHz: 7_074_000, spanHz: 4_000, vfoHz: 7_074_000, audio: usb }
    const levels = frameColumns(audioFrame(2_340), view, 4)
    expect(levels[2]).toBe(-30)
  })

  it('una trama de SDR se pinta en su frecuencia RF absoluta, sin depender del dial', () => {
    const bins = new Float32Array(100).fill(-90)
    bins[50] = -20
    const frame: SpectrumFrame = { kind: 'rf', startHz: 7_000_000, binHz: 1_000, bins }
    const view = { leftHz: 7_040_000, spanHz: 20_000, vfoHz: 7_200_000, audio: usb }
    const levels = frameColumns(frame, view, 20)
    expect(levels[10]).toBe(-20)
    expect(levels[0]).toBe(-90)
    const outside = frameColumns(frame, { ...view, leftHz: 7_200_000 }, 20)
    expect(Number.isNaN(outside[5])).toBe(true)
  })
})
