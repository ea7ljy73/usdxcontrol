import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawDecode } from '../domain/decodeList'
import { createDigiClock } from './digiClock'
import { createDigiReceiver } from './digiReceiver'
import type { DigiAudioInput, DigiDecoder } from './ports'

const T0 = Date.parse('2026-10-25T12:34:50Z')

const fakeInput = (capturedFromMs: number): DigiAudioInput & { reads: [number, number][] } => {
  const reads: [number, number][] = []
  return {
    sampleRate: 12_000,
    reads,
    read(fromMs, toMs) {
      reads.push([fromMs, toMs])
      return fromMs < capturedFromMs ? null : new Float32Array(((toMs - fromMs) * 12_000) / 1_000)
    },
    stop: vi.fn(),
    spectrum: () => null,
    levelDb: () => -60,
    setGain: vi.fn(),
    setMonitor: vi.fn(),
  }
}

const decoder = (results: RawDecode[]): DigiDecoder & { calls: number } => {
  const fake = {
    calls: 0,
    decode: async (_mode: string, samples: Float32Array) => {
      fake.calls += 1
      // Siempre un ciclo entero (lo que falta se rellena con silencio).
      expect(samples.length).toBe(15 * 12_000)
      return results
    },
  }
  return fake
}

describe('receptor FT8/FT4', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())

  it('decodifica cada ciclo a los 14,4 s y avisa con lo recibido en él', async () => {
    const input = fakeInput(T0)
    const dec = decoder([{ db: -5, dt: 0.2, df: 1200, text: 'CQ EA7LJY IM76' }])
    const receiver = createDigiReceiver({ decoder: dec, input: async () => input, clock: createDigiClock() })
    const slots: number[] = []
    receiver.onSlotDecoded(({ index, decodes }) => slots.push(index, decodes.length))
    await receiver.start()
    expect(receiver.getState().status).toBe('on')

    // 12:34:59,4 es el segundo 14,4 del ciclo 12:34:45, del que solo se oyeron 9 s: se descarta.
    await vi.advanceTimersByTimeAsync(9_500)
    expect(input.reads[0]).toEqual([Date.parse('2026-10-25T12:34:45Z'), Date.parse('2026-10-25T12:34:59.400Z')])
    expect(dec.calls).toBe(0)

    // 12:35:14,4: ciclo 12:35:00 completo.
    await vi.advanceTimersByTimeAsync(15_000)
    expect(dec.calls).toBe(1)
    expect(receiver.getState().decodes[0]).toMatchObject({ slotStartMs: Date.parse('2026-10-25T12:35:00Z'), text: 'CQ EA7LJY IM76' })
    expect(slots).toEqual([Math.floor(Date.parse('2026-10-25T12:35:00Z') / 15_000), 1])
  })

  it('si el final del audio del ciclo llega con retraso, espera y no pierde el ciclo', async () => {
    const input = fakeInput(T0)
    // El audio va 500 ms por detrás del reloj (latencia de captura).
    const read = input.read.bind(input)
    input.read = (fromMs, toMs) => (toMs > Date.now() - 500 ? null : read(fromMs, toMs))
    const dec = decoder([{ db: -5, dt: 0.2, df: 1200, text: 'CQ EA7LJY IM76' }])
    const receiver = createDigiReceiver({ decoder: dec, input: async () => input, clock: createDigiClock() })
    await receiver.start()
    // 12:35:14,4 → aún sin el final; a los 14,9 s ya está y se decodifica.
    await vi.advanceTimersByTimeAsync(Date.parse('2026-10-25T12:35:14.600Z') - T0)
    expect(dec.calls).toBe(0)
    await vi.advanceTimersByTimeAsync(600)
    expect(dec.calls).toBe(1)
    expect(receiver.getState().decodes[0]).toMatchObject({ text: 'CQ EA7LJY IM76' })
  })

  it('con el reloj corregido, pide el audio en hora local', async () => {
    const input = fakeInput(0)
    const clock = createDigiClock()
    clock.setOffset(2_000)
    const receiver = createDigiReceiver({ decoder: decoder([]), input: async () => input, clock })
    await receiver.start()
    await vi.advanceTimersByTimeAsync(10_000)
    // UTC 12:35:02 → ciclo 12:34:45 (UTC), pedido 2 s antes en hora local.
    expect(input.reads[0]).toEqual([Date.parse('2026-10-25T12:34:43Z'), Date.parse('2026-10-25T12:34:57.400Z')])
  })

  it('en pausa no decodifica y al parar suelta el audio', async () => {
    const input = fakeInput(0)
    const dec = decoder([])
    const receiver = createDigiReceiver({ decoder: dec, input: async () => input, clock: createDigiClock() })
    await receiver.start()
    receiver.pause()
    await vi.advanceTimersByTimeAsync(40_000)
    expect(dec.calls).toBe(0)
    await receiver.start()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(dec.calls).toBe(1)
    receiver.stop()
    expect(input.stop).toHaveBeenCalled()
    expect(receiver.getState().status).toBe('off')
  })

  it('si no hay audio queda en error con el motivo', async () => {
    const receiver = createDigiReceiver({
      decoder: decoder([]),
      input: async () => {
        throw new Error('Permiso denegado')
      },
      clock: createDigiClock(),
    })
    await receiver.start()
    expect(receiver.getState()).toMatchObject({ status: 'error', lastError: 'Permiso denegado' })
  })

  it('decodifica un fichero con los dos motores', async () => {
    const receiver = createDigiReceiver({
      decoder: { decode: async (mode) => [{ db: 0, dt: 0, df: 800, text: mode === 'FT8' ? 'CQ A1AA FN42' : 'CQ B1BB FN42' }] },
      input: async () => fakeInput(0),
      clock: createDigiClock(),
    })
    expect(await receiver.decodeFile(new Float32Array(10), 12_000)).toBe(2)
    expect(receiver.getState().decodes.map((d) => d.text).sort()).toEqual(['CQ A1AA FN42', 'CQ B1BB FN42'])
  })
})
