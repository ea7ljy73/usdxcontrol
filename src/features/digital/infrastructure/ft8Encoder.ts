import { workerEncode } from './digiClient'

// Genera la señal FT8 (12 kHz) de un mensaje en el tono indicado; null si el mensaje
// no es válido. En el worker si está disponible, si no en el hilo principal.
export const encodeFt8 = async (message: string, toneHz: number): Promise<Float32Array | null> => {
  const viaWorker = await workerEncode(message, toneHz)
  if (viaWorker !== null) return viaWorker
  const { ft8EngineEncode } = await import('./ft8engine')
  return ft8EngineEncode(message, toneHz)
}

export type Ft8Encode = typeof encodeFt8
