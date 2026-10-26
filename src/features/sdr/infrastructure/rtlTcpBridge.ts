import type { SdrConnector } from '../application/ports'

// Protocolo rtl_tcp: órdenes de 5 bytes (código + parámetro de 32 bits big-endian).
export const RTL_TCP = {
  frequency: 0x01,
  sampleRate: 0x02,
  gainMode: 0x03,
  gain: 0x04,
  ppm: 0x05,
  directSampling: 0x09,
} as const

const DIRECT = { off: 0, i: 1, q: 2 } as const

// rtl_tcp (o un servidor compatible) por la red, a través del proceso principal de
// Electron: el navegador no puede abrir sockets TCP.
export const rtlTcpBridge =
  (bridge: NonNullable<Window['api']>['sdr']): SdrConnector =>
  async ({ host, port }) => {
    await bridge.open({ host, port })
    const send = (command: number, value: number) => bridge.command(command, value)
    return {
      setSampleRate: async (rate) => {
        await send(RTL_TCP.sampleRate, rate)
        return rate
      },
      setCenterHz: (hz) => send(RTL_TCP.frequency, Math.round(hz)),
      setGain: async (gain) => {
        await send(RTL_TCP.gainMode, gain === null ? 0 : 1)
        if (gain !== null) await send(RTL_TCP.gain, Math.round(gain * 10))
      },
      setDirectSampling: (mode) => send(RTL_TCP.directSampling, DIRECT[mode]),
      // El parámetro es un entero con signo: rtl_tcp lo reinterpreta.
      setPpm: (ppm) => send(RTL_TCP.ppm, Math.round(ppm) >>> 0),
      read: (samples) => bridge.read(samples * 2),
      close: () => bridge.close(),
    }
  }
