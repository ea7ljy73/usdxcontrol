import type { DigiAudioInput, AudioInputOptions, MonitorOptions } from '../application/ports'

// Guarda los últimos 40 s: un ciclo FT8 entero más margen para decodificar con calma.
const BUFFER_S = 40
const CHUNK = 4096
// Si la hora calculada por el número de muestras se separa más que esto de la del reloj
// (se han perdido bloques porque el hilo principal iba cargado), se vuelve a anclar.
const RESYNC_MS = 150
// Corrección lenta de la deriva entre el reloj de la tarjeta de sonido y el del sistema.
const DRIFT_GAIN = 0.02

type SinkAudio = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> }

// Qué hacer cuando no se puede abrir la tarjeta de sonido, en vez del error del navegador.
const captureErrorText = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permiso de micrófono denegado: permite el acceso al audio (candado de la barra de direcciones) y vuelve a empezar'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No se encuentra la tarjeta de sonido elegida: conéctala o elige otra en Audio de la radio'
  }
  if (name === 'NotReadableError') {
    return 'La tarjeta de sonido está en uso por otro programa (WSJT-X, JTDX…): ciérralo y vuelve a empezar'
  }
  return `No se pudo abrir el audio de la radio${error instanceof Error && error.message ? `: ${error.message}` : ''}`
}

// Captura el audio de la radio (tarjeta de sonido elegida) en un anillo con marca de
// tiempo, con ganancia ajustable, espectro para la cascada, nivel para el vúmetro y
// escucha opcional por los altavoces del PC.
// ScriptProcessor está en desuso pero funciona igual en navegador y Electron sin
// cargar un módulo aparte, como AudioWorklet; para bloques de 85 ms basta.
export const openWebAudioInput = async ({ deviceId, gain }: AudioInputOptions): Promise<DigiAudioInput> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('La captura de audio no está disponible en este navegador')
  }
  const stream = await navigator.mediaDevices
    .getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
    .catch((error: unknown) => {
      throw new Error(captureErrorText(error))
    })
  const context = new AudioContext()
  // Abierto sin un clic previo (p. ej. la escucha en el PC al cargar), el navegador deja el
  // contexto suspendido y no llega audio: se reanuda en el primer clic o tecla.
  const wake = () => {
    if (context.state === 'suspended') void context.resume().catch(() => undefined)
    if (context.state === 'running') {
      document.removeEventListener('pointerdown', wake)
      document.removeEventListener('keydown', wake)
    }
  }
  document.addEventListener('pointerdown', wake)
  document.addEventListener('keydown', wake)
  context.addEventListener('statechange', wake)
  wake()
  const source = context.createMediaStreamSource(stream)
  const amplifier = context.createGain()
  amplifier.gain.value = gain
  const analyser = context.createAnalyser()
  analyser.fftSize = 4096
  analyser.smoothingTimeConstant = 0
  const processor = context.createScriptProcessor(CHUNK, 1, 1)
  const silent = context.createGain()
  silent.gain.value = 0
  // Escucha en el PC: rama aparte hacia un elemento <audio>, que puede salir por otra tarjeta.
  const monitorGain = context.createGain()
  monitorGain.gain.value = 0
  const monitorOut = context.createMediaStreamDestination()
  let monitorAudio: SinkAudio | null = null
  let monitorSink: string | null = null
  let retryPlay: (() => void) | null = null

  const rate = context.sampleRate
  const ring = new Float32Array(Math.round(rate * BUFFER_S))
  const bins = new Float32Array(analyser.frequencyBinCount)
  const scope = new Float32Array(analyser.fftSize)
  let written = 0
  // Latencia de captura (tarjeta + sistema de audio + bloque del ScriptProcessor): el
  // último bloque se grabó ese tiempo antes de llegar. Sin compensarla, el DT sale
  // positivo y la ventana del ciclo corta el final de las señales que llegan tarde.
  const trackLatency = stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number }
  const captureLatencyMs = Math.min(500, Math.max(0, (trackLatency?.latency ?? 0) * 1_000))
  // Hora (ms, reloj local) de la muestra 0: cada muestra está en anchorMs + i / rate.
  let anchorMs: number | null = null

  processor.onaudioprocess = (event) => {
    const chunk = event.inputBuffer.getChannelData(0)
    for (let i = 0; i < chunk.length; i++) ring[(written + i) % ring.length] = chunk[i]
    written += chunk.length
    // El último bloque acaba "ahora". La hora sale de contar muestras (sin el temblor de
    // los callbacks) y se ancla al reloj solo si se pierde audio.
    const now = Date.now() - captureLatencyMs
    const span = (written / rate) * 1_000
    if (anchorMs === null || Math.abs(now - (anchorMs + span)) > RESYNC_MS) anchorMs = now - span
    else anchorMs += (now - (anchorMs + span)) * DRIFT_GAIN
  }
  source.connect(amplifier)
  amplifier.connect(analyser)
  amplifier.connect(processor)
  processor.connect(silent)
  silent.connect(context.destination)
  source.connect(monitorGain)
  monitorGain.connect(monitorOut)

  const stopRetry = () => {
    if (retryPlay) document.removeEventListener('pointerdown', retryPlay)
    retryPlay = null
  }

  // El navegador solo deja reproducir tras un gesto: si se bloquea, se reintenta al primer clic.
  const play = (audio: SinkAudio) => {
    stopRetry()
    void audio.play().catch(() => {
      retryPlay = () => {
        stopRetry()
        void audio.play().catch(() => undefined)
      }
      document.addEventListener('pointerdown', retryPlay)
    })
  }

  const setMonitor = ({ enabled, deviceId: sinkId, volume }: MonitorOptions) => {
    monitorGain.gain.value = enabled ? Math.max(0, volume) : 0
    if (!enabled) {
      stopRetry()
      monitorAudio?.pause()
      return
    }
    if (!monitorAudio) {
      monitorAudio = new Audio() as SinkAudio
      monitorAudio.srcObject = monitorOut.stream
      monitorSink = null
    }
    const audio = monitorAudio
    const wanted = sinkId ?? ''
    if (monitorSink !== wanted && audio.setSinkId) {
      monitorSink = wanted
      void audio
        .setSinkId(wanted)
        .catch(() => undefined)
        .then(() => play(audio))
      return
    }
    play(audio)
  }

  return {
    sampleRate: rate,
    read(fromMs, toMs) {
      if (anchorMs === null) return null
      const start = Math.round(((fromMs - anchorMs) / 1_000) * rate)
      const count = Math.round(((toMs - fromMs) / 1_000) * rate)
      const oldest = Math.max(0, written - ring.length)
      if (count <= 0 || start < oldest || start + count > written) return null
      const out = new Float32Array(count)
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
    setMonitor,
    stop() {
      processor.onaudioprocess = null
      document.removeEventListener('pointerdown', wake)
      document.removeEventListener('keydown', wake)
      context.removeEventListener('statechange', wake)
      stopRetry()
      if (monitorAudio) {
        monitorAudio.pause()
        monitorAudio.srcObject = null
      }
      monitorAudio = null
      source.disconnect()
      processor.disconnect()
      monitorGain.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}
