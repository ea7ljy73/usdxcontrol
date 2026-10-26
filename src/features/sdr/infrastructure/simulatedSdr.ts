import type { SdrConnector } from '../application/ports'

// SDR de demostración: genera IQ de verdad (ruido + portadoras en RF) para probar el
// panadaptador sin hardware. Señales de 40 m y 20 m como las del simulador de audio.
const CARRIERS = [
  { hz: 7_074_620, db: -45, burst: 15 },
  { hz: 7_075_180, db: -40, burst: 15 },
  { hz: 7_076_300, db: -35, burst: 0 },
  { hz: 7_030_600, db: -40, burst: 2.6 },
  { hz: 7_150_900, db: -32, burst: 0 },
  { hz: 7_185_000, db: -38, burst: 0 },
  { hz: 14_074_900, db: -42, burst: 15 },
  { hz: 14_076_300, db: -38, burst: 0 },
  { hz: 14_200_900, db: -36, burst: 0 },
]
const NOISE = 1.2

export const simulatedSdr: SdrConnector = async () => {
  let rate = 2_048_000
  let center = 0
  let gainDb: number | null = null
  let n = 0
  let open = true
  return {
    setSampleRate: async (value) => (rate = value),
    setCenterHz: async (hz) => void (center = hz),
    setGain: async (value) => void (gainDb = value),
    setDirectSampling: async () => undefined,
    setPpm: async () => undefined,
    read: async (samples) => {
      if (!open) throw new Error('SDR cerrado')
      const out = new Uint8Array(samples * 2)
      const seconds = Date.now() / 1_000
      // Ganancia 0 (TX del uSDX): casi nada llega a la entrada.
      const scale = gainDb === 0 ? 0.02 : 1
      const active = CARRIERS.filter((c) => Math.abs(c.hz - center) < rate / 2 && (c.burst === 0 || seconds % c.burst < c.burst * 0.84))
      const tones = active.map((c) => ({ step: (2 * Math.PI * (c.hz - center)) / rate, amp: 127 * 10 ** (c.db / 20) * scale }))
      for (let i = 0; i < samples; i++) {
        let re = 127.5 + (Math.random() - 0.5) * NOISE * 2
        let im = 127.5 + (Math.random() - 0.5) * NOISE * 2
        for (const tone of tones) {
          const phase = tone.step * (n + i)
          re += tone.amp * Math.cos(phase)
          im += tone.amp * Math.sin(phase)
        }
        out[2 * i] = Math.max(0, Math.min(255, Math.round(re)))
        out[2 * i + 1] = Math.max(0, Math.min(255, Math.round(im)))
      }
      n += samples
      return out
    },
    close: async () => void (open = false),
  }
}
