import { t } from '@/i18n/i18n'
import type { DigiTransmitter, TxHandle } from '../application/ports'
import { resampleAudio } from './audioDsp'
import type { Ft8Encode } from './ft8Encoder'

const RESUME_TIMEOUT_MS = 1_000

type SinkContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void>; sinkId?: string; outputLatency?: number }

const errorText = (error: unknown) => (error instanceof Error && error.message ? error.message : String(error))

// Emite la señal FT8/FT4 por la tarjeta de sonido elegida, a la hora exacta del ciclo.
export const createWebAudioTransmitter = (encode: Ft8Encode): DigiTransmitter => {
  let context: SinkContext | null = null
  let amplifier: GainNode | null = null
  let analyser: AnalyserNode | null = null
  let outputId: string | null = null
  // Cambio de tarjeta en curso y, si falló, por qué. Antes se ignoraba el fallo y el audio
  // de TX acababa en la salida predeterminada (los altavoces del PC): PTT sin señal.
  let sinkReady: Promise<void> = Promise.resolve()
  let sinkError: string | null = null
  let gain = 1
  const scope = new Float32Array(2048)

  const ensureContext = (): SinkContext => {
    if (context) return context
    const created = new AudioContext() as SinkContext
    amplifier = created.createGain()
    amplifier.gain.value = gain
    analyser = created.createAnalyser()
    analyser.fftSize = scope.length
    amplifier.connect(analyser)
    analyser.connect(created.destination)
    context = created
    applySink()
    return created
  }

  const applySink = () => {
    const ctx = context
    if (!ctx) return
    sinkError = null
    const wanted = outputId ?? ''
    if (!ctx.setSinkId) {
      if (wanted) sinkError = t('errors.audio.noSinkSelection')
      return
    }
    sinkReady = ctx.setSinkId(wanted).then(
      () => undefined,
      (error: unknown) => {
        if (outputId === (wanted || null)) sinkError = errorText(error)
      },
    )
  }

  // Antes de emitir: la tarjeta elegida tiene que estar puesta de verdad.
  const checkSink = async (ctx: SinkContext) => {
    await sinkReady
    const wanted = outputId ?? ''
    if (sinkError || (wanted && ctx.sinkId !== undefined && ctx.sinkId !== wanted)) {
      throw new Error(t('errors.audio.sinkUnavailable', { detail: sinkError ? ` (${sinkError})` : '' }))
    }
  }

  const latencyS = () => (context ? (context.outputLatency ?? context.baseLatency ?? 0) : 0)

  // Sin un gesto previo, resume() no termina nunca: se espera un poco y se avisa.
  const running = async (ctx: SinkContext) => {
    if (ctx.state !== 'suspended') return
    await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS))])
    if (ctx.state === 'suspended') throw new Error(t('errors.audio.blocked'))
  }

  return {
    prepare() {
      const ctx = ensureContext()
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    },
    async transmit({ mode, message, toneHz, startAtMs }): Promise<TxHandle> {
      const wave = await encode(mode, message, toneHz)
      if (!wave) throw new Error(t('errors.invalidMessage', { mode }))

      const ctx = ensureContext()
      await running(ctx)
      await checkSink(ctx)
      const pcm = resampleAudio(wave, 12_000, ctx.sampleRate)
      const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate)
      buffer.copyToChannel(pcm, 0)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(amplifier as GainNode)
      // El audio tarda la latencia de salida en llegar a la radio: se adelanta lo mismo.
      const when = Math.max(ctx.currentTime, ctx.currentTime + (startAtMs - Date.now()) / 1_000 - latencyS())
      source.start(when)
      let finish: () => void = () => undefined
      const ended = new Promise<void>((resolve) => {
        finish = () => resolve()
        source.onended = () => resolve()
      })
      let startTimer = 0
      let markStarted: () => void = () => undefined
      const started = new Promise<void>((resolve) => {
        markStarted = () => resolve()
        startTimer = window.setTimeout(resolve, Math.max(0, startAtMs - Date.now()))
      })
      return {
        started,
        ended,
        cancel() {
          window.clearTimeout(startTimer)
          try {
            source.stop()
          } catch {
            // ya parado
          }
          source.disconnect()
          markStarted()
          finish()
        },
      }
    },
    async tune(toneHz) {
      const ctx = ensureContext()
      await running(ctx)
      await checkSink(ctx)
      const oscillator = ctx.createOscillator()
      oscillator.frequency.value = toneHz
      // Misma amplitud que la emisión FT8 (envolvente constante), para ajustar la potencia real.
      const level = ctx.createGain()
      level.gain.value = 1
      oscillator.connect(level).connect(amplifier as GainNode)
      oscillator.start(ctx.currentTime + latencyS())
      return {
        stop() {
          try {
            oscillator.stop()
          } catch {
            // ya parado
          }
          level.disconnect()
        },
      }
    },
    levelDb() {
      if (!analyser) return -120
      analyser.getFloatTimeDomainData(scope)
      let sum = 0
      for (const value of scope) sum += value * value
      return 10 * Math.log10(sum / scope.length + 1e-12)
    },
    outputLatencyMs: () => Math.round(latencyS() * 1_000),
    setOutput(deviceId) {
      outputId = deviceId
      applySink()
    },
    setGain(value) {
      gain = value
      if (amplifier) amplifier.gain.value = value
    },
  }
}
