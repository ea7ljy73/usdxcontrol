// Utilidades DSP compartidas por los motores FT8/FT4.
// El decodificador espera audio mono a 12000 Hz.

/** Copia sin componente continua (las interfaces de radio suelen arrastrar DC). */
function removeDcCopy(src: Float32Array): Float32Array<ArrayBuffer> {
  let mean = 0
  for (let i = 0; i < src.length; i++) mean += src[i]
  if (src.length > 0) mean /= src.length
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) out[i] = src[i] - mean
  return out
}

/** FIR paso-bajo ventana-Hann, diseñado para decimar por `factor` (entero). */
function firLowpassTaps(factor: number): Float32Array<ArrayBuffer> {
  const taps = Math.min(65, factor * 8 + 1)
  const fc = 0.44 / factor // corte normalizado (por debajo del Nyquist de salida)
  const h = new Float32Array(taps)
  let sum = 0
  for (let i = 0; i < taps; i++) {
    const m = i - (taps - 1) / 2
    const x = 2 * fc * m
    const ideal = x === 0 ? 2 * fc : Math.sin(Math.PI * x) / (Math.PI * m)
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1))
    h[i] = ideal * win
    sum += h[i]
  }
  if (sum !== 0) for (let i = 0; i < taps; i++) h[i] /= sum
  return h
}

function firDecimate(src: Float32Array<ArrayBuffer>, factor: number): Float32Array<ArrayBuffer> {
  const h = firLowpassTaps(factor)
  const half = h.length >> 1
  const outLen = Math.max(1, Math.floor(src.length / factor))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const center = i * factor
    let acc = 0
    for (let j = 0; j < h.length; j++) {
      let idx = center + j - half
      if (idx < 0) idx = 0
      else if (idx >= src.length) idx = src.length - 1
      acc += h[j] * src[idx]
    }
    out[i] = acc
  }
  return out
}

/**
 * Re-muestreo arbitrario con interpolación sinc ventana-Hann (corte en el Nyquist
 * de destino). Sustituye a la interpolación lineal, que dejaba imágenes de alias.
 */
function resampleSinc(src: Float32Array, srcRate: number, dstRate: number): Float32Array<ArrayBuffer> {
  const outLen = Math.max(1, Math.round((src.length * dstRate) / srcRate))
  const out = new Float32Array(outLen)
  const step = srcRate / dstRate
  // Corte normalizado a la tasa de entrada, limitado al Nyquist de salida
  const cs = Math.min(1, dstRate / srcRate) * 0.44
  const N = 10 // semiancho del kernel (21 taps)
  for (let i = 0; i < outLen; i++) {
    const center = i * step
    const base = Math.floor(center)
    let acc = 0
    for (let k = -N; k <= N; k++) {
      const u = base + k - center // distancia a la muestra base
      let idx = base + k
      if (idx < 0) idx = 0
      else if (idx >= src.length) idx = src.length - 1
      const z = Math.PI * u * cs
      const sincPart = z === 0 ? cs : Math.sin(z) / (Math.PI * u)
      const win = u === 0 ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * u) / N)
      acc += sincPart * win * src[idx]
    }
    out[i] = acc
  }
  return out
}

export function resampleAudio(src: Float32Array, srcRate: number, dstRate: number): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(srcRate) || !Number.isFinite(dstRate) || srcRate <= 0 || dstRate <= 0 || srcRate === dstRate) {
    return src as Float32Array<ArrayBuffer>
  }
  return resampleSinc(src, srcRate, dstRate)
}

/** Ajusta cualquier entrada (8k WebSDR, 44.1k, 48k…) a los 12 kHz que esperan los motores. */
export function downsampleTo12k(src: Float32Array, srcRate: number): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(srcRate) || srcRate <= 0) return src as Float32Array<ArrayBuffer>
  const clean = removeDcCopy(src)
  if (srcRate === 12000) return clean
  const ratio = srcRate / 12000
  if (Number.isInteger(ratio)) return firDecimate(clean, ratio)
  return resampleSinc(clean, srcRate, 12000)
}
