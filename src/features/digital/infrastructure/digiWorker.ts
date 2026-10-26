// Worker dedicado a los motores FT8/FT4: la decodificación WASM deja de bloquear
// el hilo principal (waterfall, timers del CAT y PTT siguen fluidos).
import { ft8EngineDecode, ft8EngineEncode } from './ft8engine'
import { ft4EngineDecode } from './ft4engine'

type Req =
  | { id: number; kind: 'ft8'; samples: Float32Array; sampleRate: number }
  | { id: number; kind: 'ft4'; samples: Float32Array; sampleRate: number; mode: 'FT8' | 'FT4' }
  | { id: number; kind: 'encode'; message: string; baseFrequency: number }

// ft8_lib escribe sus parámetros de FFT por stderr en cada decodificación y Emscripten
// lo manda a console.error: no son errores, se descartan solo esas líneas.
const FT8LIB_DIAGNOSTIC = /^(Block size|Subblock size|N_FFT) = \d+$/
const consoleError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  if (args.length === 1 && typeof args[0] === 'string' && FT8LIB_DIAGNOSTIC.test(args[0])) return
  consoleError(...args)
}

const ctx = self as unknown as {
  postMessage(msg: unknown, transfer?: ArrayBuffer[]): void
  addEventListener(type: 'message', fn: (e: MessageEvent<Req>) => void): void
}

ctx.addEventListener('message', async (e) => {
  const req = e.data
  try {
    if (req.kind === 'encode') {
      const wave = await ft8EngineEncode(req.message, req.baseFrequency)
      ctx.postMessage({ id: req.id, ok: true, wave }, wave ? [wave.buffer] : [])
    } else if (req.kind === 'ft8') {
      const results = await ft8EngineDecode(req.samples, req.sampleRate)
      ctx.postMessage({ id: req.id, ok: true, results })
    } else {
      const results = await ft4EngineDecode(req.samples, req.sampleRate, req.mode)
      ctx.postMessage({ id: req.id, ok: true, results })
    }
  } catch (err) {
    ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
