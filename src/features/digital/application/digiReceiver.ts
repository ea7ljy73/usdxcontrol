import { addSlotDecodes, addTxEcho, type DigiDecode, type RawDecode } from '../domain/decodeList'
import { slotIndex, slotLengthMs, slotStartMs, type DigiMode } from '../domain/slots'
import type { DigiClock } from './digiClock'
import type { DigiAudioInput, DigiAudioInputFactory, DigiDecoder, MonitorOptions } from './ports'

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

// Se decodifica antes de cerrar el ciclo, cuando ya han terminado las emisiones (FT8
// acaba a los 13,1 s y FT4 a los 5,5 s con DT = 0; se deja casi 1,3 s de margen para las
// que llegan tarde) y aún hay tiempo de contestar en el ciclo siguiente.
export const DECODE_AT_MS: Record<DigiMode, number> = { FT8: 14_400, FT4: 6_700 }

// Espera máxima a que llegue el final del audio de un ciclo antes de darlo por perdido.
const AUDIO_WAIT_MS = 1_500

// Ciclos que se decodifican como mucho de un fichero (2 min de FT8).
const MAX_FILE_CYCLES = 8

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
  let monitor: MonitorOptions = { enabled: false, deviceId: null, volume: 0.5 }
  // El audio está abierto solo para escucharlo en el PC (sin decodificar, en pausa).
  let monitorOnly = false
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
    // Como WSJT-X, no se decodifica el ciclo en el que hemos transmitido: la radio devuelve
    // nuestro propio audio y solo saldría nuestro mensaje.
    if (index !== null && state.decodes.some((decode) => decode.tx && decode.slotStartMs === slotStartUtcMs)) {
      slotListeners.forEach((listener) => listener({ index, mode, decodes: [] }))
      return
    }
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
    if (state.status !== 'on' || !input || state.decoding) return
    const now = clock.now()
    const mode = state.mode
    let index = slotIndex(now, mode)
    // Al empezar un ciclo aún se puede estar esperando el final del audio del anterior.
    if (now - slotStartMs(index, mode) < DECODE_AT_MS[mode]) index -= 1
    if (lastSlot !== null && index <= lastSlot) return
    const start = slotStartMs(index, mode)
    const end = start + DECODE_AT_MS[mode]
    // El último bloque de audio llega con algo de retraso (latencia de captura): si aún no
    // está, se reintenta en el siguiente tick en vez de perder el ciclo. Pasado el margen
    // (p. ej. se empezó a escuchar a mitad), el ciclo se da por perdido.
    if (now - end > AUDIO_WAIT_MS) {
      lastSlot = index
      return
    }
    const ownTx = state.decodes.some((decode) => decode.tx && decode.slotStartMs === start)
    if (!ownTx && input.read(clock.toLocal(start), clock.toLocal(end)) === null) return
    lastSlot = index
    void runDecode(start, end, start, index)
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
      opened.setMonitor(monitor)
    } catch (error) {
      update({ status: 'error', lastError: error instanceof Error ? error.message : String(error) })
      return
    }
    lastSlot = null
    timer ??= setInterval(tick, tickMs)
    // Si mientras se abría se ha pulsado Escuchar, se decodifica aunque se abriera para la escucha.
    update({ status: monitorOnly ? 'paused' : 'on' })
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
    monitorOnly = false
    if (state.status === 'on' || state.status === 'starting') return
    if (state.status === 'paused' && input) {
      // Lo que terminó durante la pausa no se decodifica; el ciclo en curso, sí.
      lastSlot = slotIndex(clock.now(), state.mode) - 1
      update({ status: 'on' })
      return
    }
    await openAudio()
  }

  const stop = () => {
    if (state.status === 'off' && input === null) return
    // Con la escucha en el PC activa el audio sigue abierto, pero ya no se decodifica.
    if (monitor.enabled && input) {
      session += 1
      monitorOnly = true
      update({ status: 'paused', decoding: false })
      return
    }
    closeAudio()
    update({ status: 'off', decoding: false })
  }

  // Abre el audio solo para la escucha en el PC.
  const openForMonitor = async () => {
    monitorOnly = true
    await openAudio()
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
    // Escuchar la radio por los altavoces del PC.
    setMonitor(options: MonitorOptions) {
      monitor = options
      input?.setMonitor(options)
      if (options.enabled && input === null && state.status === 'off') {
        void openForMonitor()
      } else if (!options.enabled && monitorOnly && state.status === 'paused') {
        monitorOnly = false
        closeAudio()
        update({ status: 'off', decoding: false })
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
    // Decodifica un fichero de audio en FT8 y en FT4, ciclo a ciclo desde su comienzo
    // (como "Abrir" de WSJT-X, el fichero debe empezar al inicio de un ciclo).
    async decodeFile(samples: Float32Array, sampleRate: number): Promise<number> {
      update({ decoding: true })
      try {
        const raw: RawDecode[] = []
        for (const mode of ['FT8', 'FT4'] as const) {
          const length = Math.round((slotLengthMs(mode) / 1_000) * sampleRate)
          const cycles = Math.min(MAX_FILE_CYCLES, Math.max(1, Math.ceil(samples.length / length)))
          for (let cycle = 0; cycle < cycles; cycle++) {
            const part = padToSlot(samples.subarray(cycle * length, (cycle + 1) * length), length)
            raw.push(...(await decoder.decode(mode, part, sampleRate).catch((): RawDecode[] => [])))
          }
        }
        const now = clock.now()
        update({ decodes: addSlotDecodes(state.decodes, raw, state.mode, slotStartMs(slotIndex(now, state.mode), state.mode)) })
        return raw.length
      } finally {
        update({ decoding: false })
      }
    },
    // Indicativos que conviene que el decodificador conozca (el propio y el DX).
    rememberCallsigns(callsigns: string[]) {
      void decoder.rememberCallsigns?.(callsigns.filter(Boolean)).catch(() => undefined)
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
