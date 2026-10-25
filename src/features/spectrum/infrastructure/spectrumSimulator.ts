import type { SpectrumSource } from './audioCapture'

const SAMPLE_RATE = 48_000
const FFT_SIZE = 4_096
const FRAME_DT = 1 / 60
const NOISE_DB = -94
const SPAN_HZ = 4_800

type Signal = {
  centerHz: number
  driftHz: number
  driftPeriodS: number
  ampDb: number
  widthHz: number
  burst?: { periodS: number; activeS: number }
}

const SIGNALS: Signal[] = [
  { centerHz: 1500, driftHz: 180, driftPeriodS: 9, ampDb: -30, widthHz: 80 },
  { centerHz: 3800, driftHz: 250, driftPeriodS: 13, ampDb: -36, widthHz: 30, burst: { periodS: 4.2, activeS: 1.4 } },
  { centerHz: 600, driftHz: 15, driftPeriodS: 6, ampDb: -42, widthHz: 12, burst: { periodS: 2.6, activeS: 0.9 } },
  { centerHz: 2600, driftHz: 60, driftPeriodS: 21, ampDb: -56, widthHz: 140 },
  { centerHz: 4300, driftHz: 40, driftPeriodS: 31, ampDb: -64, widthHz: 50 },
]

export const createSimulatedSpectrumAnalyser = (): SpectrumSource => {
  const bins = new Float32Array(FFT_SIZE / 2)
  let t = 0

  const signalDb = (freqHz: number, signal: Signal): number => {
    if (signal.burst) {
      const phase = t % signal.burst.periodS
      if (phase > signal.burst.activeS) return NOISE_DB
    }
    const center = signal.centerHz + signal.driftHz * Math.sin((2 * Math.PI * t) / signal.driftPeriodS)
    const distance = Math.abs(freqHz - center)
    const falloff = (distance / signal.widthHz) ** 2 * 26
    return Math.max(NOISE_DB, signal.ampDb - falloff)
  }

  return {
    fftSize: FFT_SIZE,
    frequencyBinCount: FFT_SIZE / 2,
    context: { sampleRate: SAMPLE_RATE },
    getFloatFrequencyData: (target) => {
      t += FRAME_DT
      const binHz = SAMPLE_RATE / FFT_SIZE
      const usable = Math.min(target.length, Math.ceil(SPAN_HZ / binHz))
      for (let i = 0; i < target.length; i++) {
        if (i >= usable) {
          bins[i] = NOISE_DB - 10
          if (i < target.length) target[i] = NOISE_DB - 10
          continue
        }
        const freq = i * binHz
        let db = NOISE_DB + Math.random() * 4 - 2
        for (const signal of SIGNALS) {
          db = Math.max(db, signalDb(freq, signal))
        }
        const smoothed = bins[i] * 0.55 + db * 0.45
        bins[i] = smoothed
        target[i] = smoothed
      }
    },
  }
}

export const createSimulatedAudioCapture = async (): Promise<{ capture: { stop(): void }; analyser: SpectrumSource }> => ({
  capture: { stop: () => undefined },
  analyser: createSimulatedSpectrumAnalyser(),
})
