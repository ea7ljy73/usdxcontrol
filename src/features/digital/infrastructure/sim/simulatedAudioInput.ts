import type { DigiAudioInput } from '../../application/ports'
import { spectrumDb } from './fft'
import type { SimulatedBand } from './simulatedBand'

const FFT_SIZE = 4096

// Entrada de audio del modo sin radio: escucha la banda simulada. Como si llevara
// tiempo escuchando, devuelve cualquier tramo, así el primer ciclo ya se decodifica.
export const openSimulatedAudioInput = (band: SimulatedBand, initialGain: number): DigiAudioInput => {
  let gain = initialGain
  const bins = new Float32Array(FFT_SIZE / 2)
  let spectrumAt = Number.NEGATIVE_INFINITY

  const recent = (ms: number) => {
    const now = Date.now()
    return band.read(now - ms, now).map((value) => value * gain)
  }

  return {
    sampleRate: band.sampleRate,
    read: (fromMs, toMs) => band.read(fromMs, toMs).map((value) => value * gain),
    spectrum() {
      const now = performance.now()
      if (now - spectrumAt > 30) {
        const samples = recent((FFT_SIZE / band.sampleRate) * 1_000).subarray(0, FFT_SIZE)
        const window = new Float32Array(FFT_SIZE)
        window.set(samples)
        spectrumDb(window, bins)
        spectrumAt = now
      }
      return { kind: 'audio', binHz: band.sampleRate / FFT_SIZE, bins }
    },
    levelDb() {
      const samples = recent(100)
      let sum = 0
      for (const value of samples) sum += value * value
      return 10 * Math.log10(sum / Math.max(1, samples.length) + 1e-12)
    },
    setGain(value) {
      gain = value
    },
    // Sin radio no hay nada que escuchar por los altavoces.
    setMonitor: () => undefined,
    stop: () => undefined,
  }
}
