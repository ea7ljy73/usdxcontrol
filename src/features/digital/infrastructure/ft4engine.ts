// Decodificador FT4/FT8 (módulo WASM de ChromeFT8, MIT — basado en ft8_lib).
// Espera audio a 12000 Hz. El cargador y el binario van empaquetados por Vite
// (rutas relativas), así funcionan igual en el navegador y en Electron (file://).
import { downsampleTo12k } from './audioDsp'
import createDecoderModule from './vendor/ft8ft4_decode.js'
import decoderWasmUrl from './vendor/ft8ft4_decode.wasm?url'

export interface Ft4Decode {
  db: number
  dt: number
  df: number
  text: string
}

interface WasmDecoder {
  cwrap(name: string, ret: string, args: string[]): (...args: number[]) => number
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPF32: Float32Array<ArrayBuffer>
  HEAPU8: Uint8Array<ArrayBuffer>
}

const RESULT_SIZE = 4096

let decoder: WasmDecoder | null = null
let resultPtr = 0
let protocol = 0
let fnInit: ((p: number) => number) | null = null
let fnReset: (() => number) | null = null
let fnAdd: ((p: number, n: number) => number) | null = null
let fnExec: ((a: number, b: number, p: number) => number) | null = null
let fnBlock: (() => number) | null = null

async function ensure(): Promise<boolean> {
  if (decoder) return true
  try {
    const d = (await createDecoderModule({ locateFile: () => decoderWasmUrl })) as WasmDecoder
    decoder = d
    fnInit = d.cwrap('init_decode_ex', 'number', ['number'])
    fnReset = d.cwrap('reset_decode', 'null', [])
    fnAdd = d.cwrap('add_samples', 'number', ['number', 'number'])
    fnExec = d.cwrap('exec_decode', 'number', ['number', 'number', 'number'])
    fnBlock = d.cwrap('get_block_size', 'number', [])
    resultPtr = d._malloc(RESULT_SIZE)
    fnInit(0)
    return true
  } catch {
    return false
  }
}

export async function ft4EngineDecode(audio: Float32Array, sampleRate: number, mode: 'FT8' | 'FT4' = 'FT4'): Promise<Ft4Decode[]> {
  const ok = await ensure()
  if (!ok || !decoder || !fnInit || !fnReset || !fnAdd || !fnExec || !fnBlock) return []
  const proto = mode === 'FT4' ? 1 : 0
  if (proto !== protocol) {
    protocol = proto
    fnInit(proto)
  }
  const s = downsampleTo12k(audio, sampleRate)
  fnReset()
  const blockSize = fnBlock()
  let offset = 0
  while (offset + blockSize <= s.length) {
    const block = s.subarray(offset, offset + blockSize)
    const ptr = decoder._malloc(block.length * 4)
    decoder.HEAPF32.set(block, ptr / 4)
    fnAdd(ptr, block.length)
    decoder._free(ptr)
    offset += blockSize
  }
  for (let i = 0; i < RESULT_SIZE; i++) decoder.HEAPU8[resultPtr + i] = 0
  const n = fnExec(0, 0, resultPtr)
  if (n === 0) return []
  const raw = new Uint8Array(decoder.HEAPU8.buffer, resultPtr, RESULT_SIZE)
  const text = new TextDecoder('utf8').decode(raw).replace(/\0/g, '').trim()
  if (!text) return []
  return text.split('\n').filter(Boolean).map(row => {
    const p = row.split(',')
    if (p.length >= 4) {
      return { db: parseInt(p[0], 10), dt: parseFloat(p[1]), df: parseFloat(p[2]), text: p.slice(3).join(',').trim() }
    }
    return { db: 0, dt: 0, df: 0, text: row }
  })
}
