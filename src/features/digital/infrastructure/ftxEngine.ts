// Motor FT8/FT4 (WASM propio sobre ft8_lib, MIT; fuente y compilación en native/ftx).
// Decodifica con varias pasadas y sustracción, da la SNR como WSJT-X y codifica FT8 y FT4.
// Se usa desde el worker o, si no arranca, en el hilo principal. Trabaja a 12 kHz.
import type { DigiMode } from '../domain/slots'
import { downsampleTo12k } from './audioDsp'
import createFtxModule, { type FtxModule } from './vendor/ftx.js'
import ftxWasmUrl from './vendor/ftx.wasm?url'

export interface EngineDecode {
  db: number
  dt: number
  df: number
  text: string
}

export const ENGINE_RATE = 12_000
// Banda de audio en la que se buscan señales (como el ancho de la cascada de WSJT-X).
const F_MIN_HZ = 100
const F_MAX_HZ = 3_200
const RESULT_BYTES = 64 * 1024
const SLOT_SAMPLES: Record<DigiMode, number> = { FT8: 15 * ENGINE_RATE, FT4: 7.5 * ENGINE_RATE }

const protocolOf = (mode: DigiMode) => (mode === 'FT4' ? 1 : 0)

let wasmBinary: Uint8Array | undefined
let loading: Promise<FtxModule> | null = null

/** Para las pruebas en Node: el binario WASM ya leído (allí no hay fetch de ficheros). */
export const setFtxWasmBinary = (binary: Uint8Array) => {
  wasmBinary = binary
  loading = null
}

const engine = () =>
  (loading ??= createFtxModule({
    locateFile: () => ftxWasmUrl,
    wasmBinary,
    // ft8_lib escribe parámetros internos por la salida estándar: no son útiles aquí.
    print: () => undefined,
    printErr: () => undefined,
  }).catch((error: unknown) => {
    loading = null
    throw error
  }))

const writeString = (mod: FtxModule, text: string): number => {
  const size = mod.lengthBytesUTF8(text) + 1
  const ptr = mod._malloc(size)
  mod.stringToUTF8(text, ptr, size)
  return ptr
}

/** Decodifica un ciclo: el audio empieza en el inicio del ciclo (cualquier tasa de muestreo). */
export async function ftxDecode(mode: DigiMode, samples: Float32Array, sampleRate: number): Promise<EngineDecode[]> {
  const mod = await engine()
  const audio = downsampleTo12k(samples, sampleRate)
  // Ventana del ciclo exacta: lo que falta se rellena con silencio.
  const slot = new Float32Array(SLOT_SAMPLES[mode])
  slot.set(audio.subarray(0, slot.length))
  const signalPtr = mod._malloc(slot.length * 4)
  const outPtr = mod._malloc(RESULT_BYTES)
  try {
    mod.HEAPF32.set(slot, signalPtr / 4)
    const count = mod._ftx_decode(protocolOf(mode), signalPtr, slot.length, F_MIN_HZ, F_MAX_HZ, outPtr, RESULT_BYTES)
    if (count <= 0) return []
    const bytes = mod.HEAPU8.subarray(outPtr, outPtr + RESULT_BYTES)
    const end = bytes.indexOf(0)
    const text = new TextDecoder().decode(bytes.subarray(0, end < 0 ? RESULT_BYTES : end))
    return text
      .split('\n')
      .filter(Boolean)
      .map((row) => {
        const [db, dt, df, ...message] = row.split('\t')
        return { db: Number(db), dt: Number(dt), df: Number(df), text: message.join(' ').trim() }
      })
      .filter((decode) => decode.text !== '' && Number.isFinite(decode.db) && Number.isFinite(decode.df))
  } finally {
    mod._free(signalPtr)
    mod._free(outPtr)
  }
}

/** Señal (12 kHz) de un mensaje con el tono 0 en `toneHz`; null si no se puede codificar. */
export async function ftxEncode(mode: DigiMode, message: string, toneHz: number): Promise<Float32Array<ArrayBuffer> | null> {
  const mod = await engine()
  const protocol = protocolOf(mode)
  const length = mod._ftx_wave_length(protocol)
  const textPtr = writeString(mod, message.trim().toUpperCase())
  const wavePtr = mod._malloc(length * 4)
  try {
    const written = mod._ftx_encode(protocol, textPtr, toneHz, wavePtr, length)
    if (written <= 0) return null
    return mod.HEAPF32.slice(wavePtr / 4, wavePtr / 4 + written)
  } finally {
    mod._free(textPtr)
    mod._free(wavePtr)
  }
}

/** Apunta indicativos (el propio, el DX) para mostrar completos los mensajes que los abrevian. */
export async function ftxRemember(callsigns: string[]): Promise<void> {
  const mod = await engine()
  for (const call of callsigns) {
    const value = call.trim().toUpperCase()
    if (!value) continue
    const ptr = writeString(mod, value)
    try {
      mod._ftx_remember_callsign(ptr)
    } finally {
      mod._free(ptr)
    }
  }
}
