import type { DigiAudioInput, AudioInputOptions } from '../application/ports'

// Guarda los últimos 40 s: un ciclo FT8 entero más margen para decodificar con calma.
const BUFFER_S = 40
const CHUNK = 4096

// Captura el audio de la radio (tarjeta de sonido elegida) en un anillo con marca de
// tiempo, con ganancia ajustable, espectro para la cascada y nivel para el vúmetro.
// ScriptProcessor está en desuso pero funciona igual en navegador y Electron sin
// cargar un módulo aparte, como AudioWorklet; para bloques de 85 ms basta.
export const openWebAudioInput = async ({ deviceId, gain }: AudioInputOptions): Promise<DigiAudioInput> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('La captura de audio no está disponible en este navegador')
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const amplifier = context.createGain()
  amplifier.gain.value = gain
  const analyser = context.createAnalyser()
  analyser.fftSize = 4096
  analyser.smoothingTimeConstant = 0
  const processor = context.createScriptProcessor(CHUNK, 1, 1)
  const silent = context.createGain()
  silent.gain.value = 0
  const rate = context.sampleRate
  const ring = new Float32Array(Math.round(rate * BUFFER_S))
  const bins = new Float32Array(analyser.frequencyBinCount)
  const scope = new Float32Array(analyser.fftSize)
  let written = 0
  let firstMs: number | null = null
  let lastMs = 0

  processor.onaudioprocess = (event) => {
    const chunk = event.inputBuffer.getChannelData(0)
    for (let i = 0; i < chunk.length; i++) ring[(written + i) % ring.length] = chunk[i]
    written += chunk.length
    // El último bloque acaba "ahora": de ahí sale la hora de cada muestra.
    lastMs = Date.now()
    firstMs ??= lastMs - (chunk.length / rate) * 1_000
  }
  source.connect(amplifier)
  amplifier.connect(analyser)
  amplifier.connect(processor)
  processor.connect(silent)
  silent.connect(context.destination)

  return {
    sampleRate: rate,
    read(fromMs, toMs) {
      if (firstMs === null || fromMs < firstMs || toMs > lastMs) return null
      const endAgo = Math.round(((lastMs - toMs) / 1_000) * rate)
      const count = Math.round(((toMs - fromMs) / 1_000) * rate)
      if (endAgo + count > Math.min(written, ring.length)) return null
      const out = new Float32Array(count)
      const start = written - endAgo - count
      for (let i = 0; i < count; i++) out[i] = ring[(start + i) % ring.length]
      return out
    },
    spectrum() {
      analyser.getFloatFrequencyData(bins)
      return { kind: 'audio', binHz: rate / analyser.fftSize, bins }
    },
    levelDb() {
      analyser.getFloatTimeDomainData(scope)
      let sum = 0
      for (const value of scope) sum += value * value
      return 10 * Math.log10(sum / scope.length + 1e-12)
    },
    setGain(value) {
      amplifier.gain.value = value
    },
    stop() {
      processor.onaudioprocess = null
      source.disconnect()
      processor.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}
