// Módulo Emscripten (ES6) del motor FT8/FT4 propio (ft8_lib, MIT). Fuente: native/ftx.
export interface FtxModule {
  _ftx_decode(protocol: number, signal: number, numSamples: number, fMin: number, fMax: number, out: number, outSize: number): number
  _ftx_encode(protocol: number, text: number, f0: number, out: number, maxSamples: number): number
  _ftx_wave_length(protocol: number): number
  _ftx_remember_callsign(callsign: number): void
  _ftx_set_params(candidates: number, iterations: number, minScore: number, passes: number): void
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPF32: Float32Array<ArrayBuffer>
  HEAPU8: Uint8Array<ArrayBuffer>
  stringToUTF8(text: string, ptr: number, maxBytes: number): void
  lengthBytesUTF8(text: string): number
}
declare const createFtxModule: (options: {
  locateFile?: (path: string) => string
  wasmBinary?: ArrayBuffer | Uint8Array
  print?: (text: string) => void
  printErr?: (text: string) => void
}) => Promise<FtxModule>
export default createFtxModule
