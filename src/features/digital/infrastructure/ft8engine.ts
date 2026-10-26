// Motor FT8 (ft8js, WASM de ft8_lib, MIT) — se invoca desde el worker o como
// reserva en el hilo principal. Espera audio a cualquier tasa; re-muestrea a 12 kHz.
import { downsampleTo12k } from './audioDsp'

export interface EngineDecode {
  db: number
  dt: number
  df: number
  text: string
}

export async function ft8EngineDecode(samples: Float32Array, sampleRate: number): Promise<EngineDecode[]> {
  const mod = await import('ft8js')
  const s = downsampleTo12k(samples, sampleRate)
  const res = await mod.decode(s)
  return res.map(d => ({ db: d.db, dt: d.dt, df: d.df, text: d.text }))
}

export async function ft8EngineEncode(message: string, baseFrequency = 1000): Promise<Float32Array<ArrayBuffer> | null> {
  const mod = await import('ft8js')
  const wave = await mod.encode(message, baseFrequency)
  // Copia defensiva: la vista devuelta apunta a la heap WASM, que se libera después.
  return wave ? wave.slice() : null
}
