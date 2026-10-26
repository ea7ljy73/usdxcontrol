// Cliente del worker de motores FT8/FT4. Si el worker no está disponible o falla,
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
export async function workerDecode(kind: 'ft8' | 'ft4', samples: Float32Array, sampleRate: number, mode: 'FT8' | 'FT4'): Promise<DigiResult[] | null> {
  if (broken) return null
  try {
    // Copia para poder transferir sin descolgar el buffer del llamante
    const copy = samples.slice()
    const r = await request({ kind, samples: copy, sampleRate, mode }, [copy.buffer])
    return (r.results as DigiResult[]) ?? []
  } catch {
    return null
  }
}

/** Genera la señal FT8 en el worker. Devuelve null si hay que usar la reserva local. */
export async function workerEncode(message: string, baseFrequency: number): Promise<Float32Array<ArrayBuffer> | null> {
  if (broken) return null
  try {
    const r = await request({ kind: 'encode', message, baseFrequency })
    return (r.wave as Float32Array<ArrayBuffer> | null) ?? null
  } catch {
    return null
  }
}
