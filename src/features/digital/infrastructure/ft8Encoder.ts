import type { DigiMode } from '../domain/slots'
import { workerEncode } from './digiClient'

// Genera la señal FT8/FT4 (12 kHz, solo la emisión: 12,64 s en FT8 y 5,04 s en FT4) de un
// mensaje en el tono indicado; null si el mensaje no es válido. En el worker si está
// disponible, si no en el hilo principal.
export const encodeFt8 = async (mode: DigiMode, message: string, toneHz: number): Promise<Float32Array | null> => {
  const viaWorker = await workerEncode(mode, message, toneHz)
  if (viaWorker !== undefined) return viaWorker
  const { ftxEncode } = await import('./ftxEngine')
  return ftxEncode(mode, message, toneHz)
}

export type Ft8Encode = typeof encodeFt8
