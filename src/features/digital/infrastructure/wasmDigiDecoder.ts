import type { DigiDecoder } from '../application/ports'
import { workerDecode, workerRemember } from './digiClient'

// FT8 y FT4 con el motor WASM propio, en el worker para no frenar la pantalla.
// Si el worker no arranca, el mismo motor corre en el hilo principal.
export const createWasmDigiDecoder = (): DigiDecoder => ({
  async decode(mode, samples, sampleRate) {
    const viaWorker = await workerDecode(mode, samples, sampleRate)
    if (viaWorker) return viaWorker
    const { ftxDecode } = await import('./ftxEngine')
    return ftxDecode(mode, samples, sampleRate)
  },
  async rememberCallsigns(callsigns) {
    if (await workerRemember(callsigns)) return
    const { ftxRemember } = await import('./ftxEngine')
    await ftxRemember(callsigns)
  },
})
