import type { DigiDecoder } from '../application/ports'
import { workerDecode } from './digiClient'

// FT8 con ft8js (ft8_lib) y FT4 con ChromeFT8, en el worker para no frenar la pantalla.
// Si el worker no arranca, el mismo motor corre en el hilo principal.
export const createWasmDigiDecoder = (): DigiDecoder => ({
  async decode(mode, samples, sampleRate) {
    const kind = mode === 'FT8' ? 'ft8' : 'ft4'
    const viaWorker = await workerDecode(kind, samples, sampleRate, mode)
    if (viaWorker) return viaWorker
    if (mode === 'FT8') {
      const { ft8EngineDecode } = await import('./ft8engine')
      return ft8EngineDecode(samples, sampleRate)
    }
    const { ft4EngineDecode } = await import('./ft4engine')
    return ft4EngineDecode(samples, sampleRate, mode)
  },
})
