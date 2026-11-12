import { t } from '@/i18n/i18n'
import type { SpectrumFeed } from '../application/ports'

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}

// Varias vistas leen la misma fuente en cada fotograma: se recalcula como mucho
// una vez por fotograma y el resto de lecturas reciben la misma trama.
const FRAME_MS = 15

export const startAudioCapture = async (): Promise<SpectrumFeed> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t('errors.audio.captureUnavailable'))

  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 4096
  analyser.smoothingTimeConstant = 0.55
  source.connect(analyser)
  const bins = new Float32Array(analyser.frequencyBinCount)
  const binHz = context.sampleRate / analyser.fftSize
  let readAt = Number.NEGATIVE_INFINITY

  return {
    read: () => {
      const now = performance.now()
      if (now - readAt >= FRAME_MS) {
        analyser.getFloatFrequencyData(bins)
        readAt = now
      }
      return { kind: 'audio', binHz, bins }
    },
    stop: () => {
      source.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}
