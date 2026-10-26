import type { SpectrumFeed } from '../application/ports'
import { audioHzAt, type AudioView } from '../domain/audioMapping'

const SAMPLE_RATE = 48_000
const FFT_SIZE = 4_096
const FRAME_DT = 1 / 60
const NOISE_DB = -94
const SPAN_HZ = 4_800

// Dónde está la radio simulada: sin esto el simulador solo da ruido.
export type SimulatedTuning = () => { dialHz: number; view: AudioView } | null

// Señales en su RF real: aparecen y desaparecen del audio según se sintoniza,
// como en la radio, para poder probar el scan y el panadaptador.
type Signal = {
  rfHz: number
  driftHz: number
  driftPeriodS: number
  ampDb: number
  widthHz: number
  burst?: { periodS: number; activeS: number }
}

const SIGNALS: Signal[] = [
  // 40 m: actividad FT8 alrededor de 7.074, una baliza fija, CW y fonía.
  { rfHz: 7_074_620, driftHz: 2, driftPeriodS: 15, ampDb: -48, widthHz: 25, burst: { periodS: 15, activeS: 12.6 } },
  { rfHz: 7_075_180, driftHz: 2, driftPeriodS: 15, ampDb: -42, widthHz: 25, burst: { periodS: 15, activeS: 12.6 } },
  { rfHz: 7_075_840, driftHz: 2, driftPeriodS: 15, ampDb: -55, widthHz: 25, burst: { periodS: 30, activeS: 12.6 } },
  { rfHz: 7_076_300, driftHz: 0, driftPeriodS: 1, ampDb: -38, widthHz: 15 },
  { rfHz: 7_030_600, driftHz: 15, driftPeriodS: 6, ampDb: -42, widthHz: 12, burst: { periodS: 2.6, activeS: 0.9 } },
  { rfHz: 7_150_900, driftHz: 180, driftPeriodS: 9, ampDb: -36, widthHz: 400 },
  // 20 m.
  { rfHz: 14_074_900, driftHz: 2, driftPeriodS: 15, ampDb: -46, widthHz: 25, burst: { periodS: 15, activeS: 12.6 } },
  { rfHz: 14_076_300, driftHz: 0, driftPeriodS: 1, ampDb: -40, widthHz: 15 },
  { rfHz: 14_200_900, driftHz: 180, driftPeriodS: 11, ampDb: -40, widthHz: 400 },
]

export const createSimulatedAudioFeed = (tuning: SimulatedTuning): SpectrumFeed => {
  const binHz = SAMPLE_RATE / FFT_SIZE
  const bins = new Float32Array(FFT_SIZE / 2).fill(NOISE_DB)
  const usable = Math.min(bins.length, Math.ceil(SPAN_HZ / binHz))
  const audible: { audioHz: number; signal: Signal }[] = []
  let t = 0
  let readAt = Number.NEGATIVE_INFINITY

  const signalDb = (freqHz: number, audioHz: number, signal: Signal): number => {
    const distance = Math.abs(freqHz - audioHz)
    const falloff = (distance / signal.widthHz) ** 2 * 26
    return Math.max(NOISE_DB, signal.ampDb - falloff)
  }

  const step = () => {
    t += FRAME_DT
    audible.length = 0
    const tuned = tuning()
    if (tuned) {
      for (const signal of SIGNALS) {
        if (signal.burst && t % signal.burst.periodS > signal.burst.activeS) continue
        const rf = signal.rfHz + signal.driftHz * Math.sin((2 * Math.PI * t) / signal.driftPeriodS)
        const audioHz = audioHzAt(rf - tuned.dialHz, tuned.view)
        if (audioHz !== null) audible.push({ audioHz, signal })
      }
    }
    for (let i = 0; i < bins.length; i++) {
      if (i >= usable) {
        bins[i] = NOISE_DB - 10
        continue
      }
      let db = NOISE_DB + Math.random() * 4 - 2
      for (const { audioHz, signal } of audible) {
        db = Math.max(db, signalDb(i * binHz, audioHz, signal))
      }
      bins[i] = bins[i] * 0.55 + db * 0.45
    }
  }

  return {
    // Una trama nueva por fotograma aunque la lean varias vistas.
    read: () => {
      const now = performance.now()
      if (now - readAt >= FRAME_DT * 1000 * 0.9) {
        step()
        readAt = now
      }
      return { kind: 'audio', binHz, bins }
    },
    stop: () => undefined,
  }
}

export const startSimulatedAudioFeed = async (tuning: SimulatedTuning): Promise<SpectrumFeed> =>
  createSimulatedAudioFeed(tuning)
