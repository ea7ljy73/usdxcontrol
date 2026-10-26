import { addSlotDecodes, addTxEcho, type DigiDecode, type RawDecode } from '../domain/decodeList'
import { slotIndex, slotLengthMs, slotStartMs, type DigiMode } from '../domain/slots'
import type { DigiClock } from './digiClock'
import type { DigiAudioInput, DigiAudioInputFactory, DigiDecoder } from './ports'

export type DigiReceiverState = {
  mode: DigiMode
  status: 'off' | 'starting' | 'on' | 'paused' | 'error'
  decoding: boolean
  decodes: DigiDecode[]
  lastDecodedSlotMs: number | null
  lastError: string | null
  inputDeviceId: string | null
  inputGain: number
}

// Se decodifica antes de cerrar el ciclo, cuando ya han terminado las emisiones
// (FT8 acaba a los 13,1 s), para poder contestar en el ciclo siguiente.
export const DECODE_AT_MS: Record<DigiMode, number> = { FT8: 14_000, FT4: 6_400 }

type SlotListener = (event: { index: number; mode: DigiMode; decodes: DigiDecode[] }) => void

type Options = {
  decoder: DigiDecoder
  input: DigiAudioInputFactory
  clock: DigiClock
  tickMs?: number
}

const padToSlot = (samples: Float32Array, length: number): Float32Array => {
  if (samples.length >= length) return samples
  const padded = new Float32Array(length)
  padded.set(samples)
  return padded
}

// Escucha el audio de la radio y decodifica cada ciclo; también decodifica a mano
// (lo último oído o un fichero WAV) y muestra el eco de lo transmitido.
export const createDigiReceiver = ({ decoder, input: openInput, clock, tickMs = 200 }: Options) => {
  let state: DigiReceiverState = {
    mode: 'FT8',
    status: 'off',
    decoding: false,
    decodes: [],
    lastDecodedSlotMs: null,
    lastError: null,
    inputDeviceId: null,
    inputGain: 1,
  }
  let input: DigiAudioInput | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let lastSlot: number | null = null
  let session = 0
  const listeners = new Set<(state: DigiReceiverState) => void>()
  const slotListeners = new Set<SlotListener>()

  const update = (patch: Partial<DigiReceiverState>) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener(state))
  }

  const runDecode = async (fromUtcMs: number, toUtcMs: number, slotStartUtcMs: number, index: number | null) => {
    if (!input || state.decoding) return
    const mode = state.mode
    const samples = input.read(clock.toLocal(fromUtcMs), clock.toLocal(toUtcMs))
    // Tramo sin capturar entero (se empezó a escuchar a mitad): no se decodifica.
    if (samples === null) return
    const rate = input.sampleRate
    const started = session
    update({ decoding: true })
    try {
      const window = padToSlot(samples, Math.round((slotLengthMs(mode) / 1_000) * rate))
      const raw = await decoder.decode(mode, window, rate)
      if (started !== session || mode !== state.mode) return
      const decodes = addSlotDecodes(state.decodes, raw, mode, slotStartUtcMs)
      update({ decoding: false, decodes, lastDecodedSlotMs: slotStartUtcMs, lastError: null })
      if (index !== null) {
        const ofSlot = decodes.filter((decode) => decode.slotStartMs === slotStartUtcMs && !decode.tx)
        slotListeners.forEach((listener) => listener({ index, mode, decodes: ofSlot }))
      }
    } catch (error) {
      if (started !== session) return
      update({ decoding: false, lastError: error instanceof Error ? error.message : String(error) })
    } finally {
      if (started === session && state.decoding) update({ decoding: false })
    }
  }

  const tick = () => {
    if (state.status !== 'on') return
    const now = clock.now()
    const mode = state.mode
    const index = slotIndex(now, mode)
    const start = slotStartMs(index, mode)
    if (now - start < DECODE_AT_MS[mode] || lastSlot === index) return
    lastSlot = index
    void runDecode(start, start + DECODE_AT_MS[mode], start, index)
  }

  const openAudio = async () => {
    session += 1
    const started = session
    update({ status: 'starting', lastError: null })
    try {
      const opened = await openInput({ deviceId: state.inputDeviceId, gain: state.inputGain })
      if (started !== session) {
        opened.stop()
        return
      }
      input = opened
    } catch (error) {
      update({ status: 'error', lastError: error instanceof Error ? error.message : String(error) })
      return
    }
    lastSlot = null
    timer ??= setInterval(tick, tickMs)
    update({ status: 'on' })
    tick()
  }

  const closeAudio = () => {
    session += 1
    if (timer) clearInterval(timer)
    timer = null
    input?.stop()
    input = null
    lastSlot = null
  }

  const start = async () => {
    if (state.status === 'on' || state.status === 'starting') return
    if (state.status === 'paused' && input) {
      update({ status: 'on' })
      return
    }
    await openAudio()
  }

  const stop = () => {
    if (state.status === 'off' && input === null) return
    closeAudio()
    update({ status: 'off', decoding: false })
  }

  return {
    start,
    stop,
    pause: () => {
      if (state.status === 'on') update({ status: 'paused' })
    },
    setMode(mode: DigiMode) {
      if (mode === state.mode) return
      // El ciclo cambia de longitud: lo que se estaba decodificando ya no vale.
      session += 1
      lastSlot = null
      update({ mode, decoding: false })
    },
    async setInputDevice(deviceId: string | null) {
      update({ inputDeviceId: deviceId })
      if (input) {
        const wasPaused = state.status === 'paused'
        closeAudio()
        await openAudio()
        if (wasPaused) update({ status: 'paused' })
      }
    },
    setInputGain(gain: number) {
      input?.setGain(gain)
      update({ inputGain: gain })
    },
    // Decodifica ya el último ciclo oído (botón "Decodificar").
    decodeNow: () => {
      const now = clock.now()
      return runDecode(now - slotLengthMs(state.mode), now, slotStartMs(slotIndex(now, state.mode), state.mode), null)
    },
    // Decodifica un fichero de audio con los dos motores (FT8 y FT4).
    async decodeFile(samples: Float32Array, sampleRate: number): Promise<number> {
      update({ decoding: true })
      try {
        const [ft8, ft4] = await Promise.all([
          decoder.decode('FT8', samples, sampleRate).catch((): RawDecode[] => []),
          decoder.decode('FT4', samples, sampleRate).catch((): RawDecode[] => []),
        ])
        const raw = [...ft8, ...ft4]
        const now = clock.now()
        update({ decodes: addSlotDecodes(state.decodes, raw, state.mode, slotStartMs(slotIndex(now, state.mode), state.mode)) })
        return raw.length
      } finally {
        update({ decoding: false })
      }
    },
    addTxEcho(message: string, slotStartUtcMs: number, toneHz: number) {
      update({ decodes: addTxEcho(state.decodes, message, state.mode, slotStartUtcMs, toneHz) })
    },
    clear: () => update({ decodes: [], lastDecodedSlotMs: null }),
    input: () => input,
    onSlotDecoded(listener: SlotListener) {
      slotListeners.add(listener)
      return () => slotListeners.delete(listener)
    },
    subscribe(listener: (state: DigiReceiverState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getState: () => state,
  }
}

export type DigiReceiver = ReturnType<typeof createDigiReceiver>
