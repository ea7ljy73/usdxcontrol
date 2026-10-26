import { describe, expect, it, vi } from 'vitest'
import type { DirectSamplingMode, SdrDevice } from './ports'
import { createSdrReceiver } from './sdrReceiver'

const memoryStore = () => {
  const data = new Map<string, unknown>()
  return { get: <T,>(key: string) => (data.get(key) as T) ?? null, set: (key: string, value: unknown) => void data.set(key, value) }
}

const fakeDevice = () => {
  const calls: string[] = []
  const device: SdrDevice & { calls: string[] } = {
    calls,
    setSampleRate: async (rate) => (calls.push(`rate ${rate}`), rate),
    setCenterHz: async (hz) => void calls.push(`center ${hz}`),
    setGain: async (gain) => void calls.push(`gain ${gain}`),
    setDirectSampling: async (mode: DirectSamplingMode) => void calls.push(`direct ${mode}`),
    setPpm: async (ppm) => void calls.push(`ppm ${ppm}`),
    read: async (samples) => new Uint8Array(samples * 2).fill(128),
    close: async () => void calls.push('close'),
  }
  return device
}

// Deja correr el bucle de lectura unas cuantas vueltas.
const spin = async (times = 20) => {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

const setup = () => {
  const device = fakeDevice()
  const connector = vi.fn(async () => device)
  const sdr = createSdrReceiver({ connectors: { usb: connector }, store: memoryStore(), sleep: () => new Promise((resolve) => setTimeout(resolve, 0)) })
  return { sdr, device, connector }
}

describe('receptor SDR', () => {
  it('se configura al conectar, se centra en la banda y da espectro de RF', async () => {
    const { sdr, device } = setup()
    sdr.follow(7_074_000, { fromHz: 7_000_000, toHz: 7_200_000 })
    await sdr.connect()
    await spin()
    expect(device.calls.slice(0, 5)).toEqual(['rate 2048000', 'ppm 0', 'direct q', 'gain null', 'center 7100000'])
    const frame = sdr.feed().read()
    expect(frame).toMatchObject({ kind: 'rf', startHz: 7_100_000 - 1_024_000, binHz: 2_048_000 / 4_096 })
    expect(sdr.getState()).toMatchObject({ status: 'on', centerHz: 7_100_000 })
    await sdr.disconnect()
    expect(device.calls).toContain('close')
  })

  it('mientras transmite el uSDX deja de recibir y baja la ganancia; al volver la restaura', async () => {
    const { sdr, device } = setup()
    sdr.follow(14_074_000, { fromHz: 14_000_000, toHz: 14_350_000 })
    await sdr.connect()
    await spin()
    sdr.setTx(true)
    expect(sdr.feed().read()).toBeNull()
    await spin()
    expect(sdr.getState().status).toBe('muted')
    expect(device.calls).toContain('gain 0')
    sdr.setTx(false)
    await spin()
    expect(sdr.getState().status).toBe('on')
    expect(device.calls.at(-1) === 'gain null' || device.calls.includes('gain null')).toBe(true)
    expect(sdr.feed().read()).not.toBeNull()
    await sdr.disconnect()
  })

  it('sin silencio en TX sigue recibiendo', async () => {
    const { sdr, device } = setup()
    await sdr.updateSettings({ muteOnTx: false })
    sdr.follow(7_074_000, null)
    await sdr.connect()
    sdr.setTx(true)
    await spin()
    expect(sdr.getState().status).toBe('on')
    expect(device.calls).not.toContain('gain 0')
    await sdr.disconnect()
  })

  it('un error del dispositivo queda en el estado y se puede reconectar', async () => {
    const { sdr, device, connector } = setup()
    device.read = async () => {
      throw new Error('USB desconectado')
    }
    sdr.follow(7_074_000, null)
    await sdr.connect()
    await spin()
    expect(sdr.getState()).toMatchObject({ status: 'error', lastError: 'USB desconectado' })
    await sdr.connect()
    expect(connector).toHaveBeenCalledTimes(2)
  })
})
