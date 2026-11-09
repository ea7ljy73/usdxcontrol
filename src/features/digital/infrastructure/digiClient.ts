import type { DigiMode } from '../domain/slots'

// Cliente del worker del motor FT8/FT4. Si el worker no está disponible o falla,
// las funciones devuelven null y el llamante ejecuta el motor en el hilo principal.

export interface DigiResult {
  db: number
  dt: number
  df: number
  text: string
}

type Pending = { resolve: (v: { results?: unknown[]; wave?: Float32Array | null }) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let broken = false
const pending = new Map<number, Pending>()
let nextId = 1

function ensureWorker(): Worker | null {
  if (broken) return null
  if (worker) return worker
  try {
    const w = new Worker(new URL('./digiWorker.ts', import.meta.url), { type: 'module' })
    w.onerror = () => {
      broken = true
      for (const p of pending.values()) p.reject(new Error('worker no disponible'))
      pending.clear()
      try { w.terminate() } catch { /* ya parado */ }
      if (worker === w) worker = null
    }
    w.onmessage = (e: MessageEvent) => {
      const data = e.data as { id: number; ok: boolean; results?: unknown[]; wave?: Float32Array | null; error?: string }
      const p = pending.get(data.id)
      if (!p) return
      pending.delete(data.id)
      if (data.ok) p.resolve({ results: data.results, wave: data.wave ?? null })
      else p.reject(new Error(data.error || 'error en el motor'))
    }
    worker = w
    return w
  } catch {
    broken = true
    return null
  }
}

function request(payload: Record<string, unknown>, transfer?: ArrayBuffer[]): Promise<{ results?: unknown[]; wave?: Float32Array | null }> {
  const w = ensureWorker()
  if (!w) return Promise.reject(new Error('sin-worker'))
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try {
      w.postMessage({ id, ...payload }, transfer ?? [])
    } catch (e) {
      pending.delete(id)
      reject(e instanceof Error ? e : new Error('postMessage'))
    }
  })
}

/** Decodifica en el worker. Devuelve null si hay que usar la reserva local. */
export async function workerDecode(mode: DigiMode, samples: Float32Array, sampleRate: number): Promise<DigiResult[] | null> {
  if (broken) return null
  try {
    // Copia para poder transferir sin descolgar el buffer del llamante
    const copy = samples.slice()
    const r = await request({ kind: 'decode', mode, samples: copy, sampleRate }, [copy.buffer])
    return (r.results as DigiResult[]) ?? []
  } catch {
    return null
  }
}

/** Genera la señal en el worker. undefined si hay que usar la reserva local; null si el mensaje no vale. */
export async function workerEncode(mode: DigiMode, message: string, toneHz: number): Promise<Float32Array<ArrayBuffer> | null | undefined> {
  if (broken) return undefined
  try {
    const r = await request({ kind: 'encode', mode, message, toneHz })
    return (r.wave as Float32Array<ArrayBuffer> | null) ?? null
  } catch {
    return undefined
  }
}

/** Apunta indicativos en la tabla del motor del worker. false si hay que hacerlo en local. */
export async function workerRemember(callsigns: string[]): Promise<boolean> {
  if (broken) return false
  try {
    await request({ kind: 'remember', callsigns })
    return true
  } catch {
    return false
  }
}
