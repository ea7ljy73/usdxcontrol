// Espectro de RF a partir de muestras IQ de 8 bits sin signo (formato RTL-SDR: I, Q, I, Q…).
// El resultado va ordenado de la frecuencia más baja a la más alta (centro del SDR en la
// mitad) y en dBFS, comparable con el espectro de audio del panadaptador.

const windows = new Map<number, Float32Array>()
const hann = (size: number) => {
  let window = windows.get(size)
  if (!window) {
    window = new Float32Array(size)
    for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
    windows.set(size, window)
  }
  return window
}

// FFT compleja in situ (radix 2).
export const fftInPlace = (re: Float32Array, im: Float32Array) => {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size
    const half = size / 2
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(step * k)
        const wi = Math.sin(step * k)
        const a = start + k
        const b = a + half
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

// Bins junto al centro que se rellenan: el pico de continua del RTL-SDR no es una señal.
export const DC_BINS = 2

export const iqSpectrumDb = (iq: Uint8Array, fftSize: number): Float32Array => {
  const blocks = Math.floor(iq.length / (2 * fftSize))
  if (blocks < 1) throw new Error(`Hacen falta ${fftSize} muestras IQ`)
  const window = hann(fftSize)
  const power = new Float64Array(fftSize)
  const re = new Float32Array(fftSize)
  const im = new Float32Array(fftSize)
  // Ganancia coherente de Hann (0,5): un tono a fondo de escala sale a 0 dBFS.
  const scale = 1 / (fftSize * 0.5)
  for (let block = 0; block < blocks; block++) {
    const base = block * fftSize * 2
    for (let i = 0; i < fftSize; i++) {
      re[i] = ((iq[base + 2 * i] - 127.5) / 127.5) * window[i]
      im[i] = ((iq[base + 2 * i + 1] - 127.5) / 127.5) * window[i]
    }
    fftInPlace(re, im)
    for (let i = 0; i < fftSize; i++) {
      const mr = re[i] * scale
      const mi = im[i] * scale
      power[i] += mr * mr + mi * mi
    }
  }
  const out = new Float32Array(fftSize)
  const half = fftSize / 2
  for (let i = 0; i < fftSize; i++) {
    // fftshift: las frecuencias negativas (segunda mitad) van a la izquierda.
    const source = (i + half) % fftSize
    out[i] = 10 * Math.log10(power[source] / blocks + 1e-15)
  }
  const left = out[half - DC_BINS - 1]
  const right = out[half + DC_BINS + 1]
  for (let i = half - DC_BINS; i <= half + DC_BINS; i++) out[i] = (left + right) / 2
  return out
}
