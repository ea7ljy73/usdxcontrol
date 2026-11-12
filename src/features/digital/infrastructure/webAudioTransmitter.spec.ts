import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebAudioTransmitter } from './webAudioTransmitter'

// AudioContext mínimo: solo lo que usa el transmisor antes de generar el audio.
const fakeAudioContext = (setSinkId: (id: string) => Promise<void>) => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 }, fftSize: 0, getFloatTimeDomainData: vi.fn() })
  return class {
    state = 'running'
    sampleRate = 48_000
    currentTime = 0
    destination = node()
    sinkId = ''
    createGain = node
    createAnalyser = node
    async setSinkId(id: string) {
      await setSinkId(id)
      this.sinkId = id
    }
  }
}

describe('transmisor Web Audio', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('si la salida elegida no se puede usar, no emite (el audio iría a los altavoces del PC)', async () => {
    vi.stubGlobal(
      'AudioContext',
      fakeAudioContext(async (id) => {
        if (id) throw new DOMException('Requested device not found', 'NotFoundError')
      }),
    )
    const encode = vi.fn(async () => new Float32Array(12_000))
    const transmitter = createWebAudioTransmitter(encode)
    transmitter.setOutput('tarjeta-del-usdx')
    transmitter.prepare()
    await expect(
      transmitter.transmit({ mode: 'FT8', message: 'CQ EA7LJY IM87', toneHz: 1_500, startAtMs: Date.now() + 1_000, slotIndex: 1 }),
    ).rejects.toThrow(/salida de audio elegida no está disponible \(.*Requested device not found\)/)
    await expect(transmitter.tune(1_500)).rejects.toThrow(/Elige en Sonido la salida conectada al uSDX/)
  })
})
