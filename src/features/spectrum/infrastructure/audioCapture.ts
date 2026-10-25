export type AudioCapture = { stop(): void }

export type SpectrumSource = {
  fftSize: number
  frequencyBinCount: number
  context: { sampleRate: number }
  getFloatFrequencyData(array: Float32Array): void
}

export type AudioAnalyser = {
  capture: AudioCapture
  analyser: SpectrumSource
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}

export const startAudioCapture = async (): Promise<AudioAnalyser> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('La captura de audio no está disponible en este navegador')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 4096
  analyser.smoothingTimeConstant = 0.55
  source.connect(analyser)
  return {
    capture: {
      stop: () => {
        source.disconnect()
        stream.getTracks().forEach((track) => track.stop())
        void context.close()
      },
    },
    analyser,
  }
}
