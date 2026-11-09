// Worker dedicado al motor FT8/FT4: la decodificación WASM no bloquea el hilo principal
// (cascada, temporizadores del CAT y PTT siguen fluidos).
import type { DigiMode } from '../domain/slots'
import { ftxDecode, ftxEncode, ftxRemember } from './ftxEngine'

type Req =
  | { id: number; kind: 'decode'; mode: DigiMode; samples: Float32Array; sampleRate: number }
  | { id: number; kind: 'encode'; mode: DigiMode; message: string; toneHz: number }
  | { id: number; kind: 'remember'; callsigns: string[] }

const ctx = self as unknown as {
  postMessage(msg: unknown, transfer?: ArrayBuffer[]): void
  addEventListener(type: 'message', fn: (e: MessageEvent<Req>) => void): void
}

ctx.addEventListener('message', async (e) => {
  const req = e.data
  try {
    if (req.kind === 'encode') {
      const wave = await ftxEncode(req.mode, req.message, req.toneHz)
      ctx.postMessage({ id: req.id, ok: true, wave }, wave ? [wave.buffer] : [])
    } else if (req.kind === 'decode') {
      const results = await ftxDecode(req.mode, req.samples, req.sampleRate)
      ctx.postMessage({ id: req.id, ok: true, results })
    } else {
      await ftxRemember(req.callsigns)
      ctx.postMessage({ id: req.id, ok: true })
    }
  } catch (err) {
    ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
