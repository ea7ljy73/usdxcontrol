import { extractFrames, parseFrame, encodeFrame, type CatCommand } from '../domain/cat/codec'
import { clampFrequency, type Frequency } from '../domain/frequency'
import type { RadioMode } from '../domain/mode'
import type { RadioLink, RadioLinkStatus } from './ports'

export type RadioSnapshot = {
  linkStatus: RadioLinkStatus
  frequency: Frequency | null
  mode: RadioMode | null
  tx: boolean
  pendingFrequency: boolean
  pendingMode: boolean
  lastError: string | null
  extended: boolean
  meter: number | null
  volume: number | null
  agc: number | null
  nr: number | null
}

type Intent<T> = { value: T; sentAt: number }

type Options = {
  minFrameGapMs?: number
  pollIntervalMs?: number
  idlePollIntervalMs?: number
  activeWindowMs?: number
  retryAfterMs?: number
  pttRetryMs?: number
  extended?: boolean
}

const PUMP_TICK_MS = 50
const MAX_PARTIAL_BUFFER = 64

export const createRadioSession = (link: RadioLink, options: Options = {}) => {
  const {
    minFrameGapMs = 120,
    pollIntervalMs = 500,
    // Cada trama CAT se oye como un chasquido en el uSDX y hace parpadear los LED del
    // puerto: en reposo se sondea poco, y deprisa solo mientras hay actividad.
    idlePollIntervalMs = 3_000,
    activeWindowMs = 4_000,
    retryAfterMs = 2000,
    pttRetryMs = 350,
    extended = false,
  } = options

  let linkStatus: RadioLinkStatus = 'disconnected'
  let frequency: Frequency | null = null
  let mode: RadioMode | null = null
  let tx = false
  let meter: number | null = null
  let volume: number | null = null
  let agc: number | null = null
  let nr: number | null = null
  let intentFrequency: Intent<Frequency> | null = null
  let intentMode: Intent<RadioMode> | null = null
  let lastError: string | null = null
  let queue: CatCommand[] = []
  let partial = ''
  let lastSentAt = Number.NEGATIVE_INFINITY
  let pollTick = 0
  let lastActivityAt = Number.NEGATIVE_INFINITY
  let lastPollAt = Number.NEGATIVE_INFINITY
  let pttRetryAt = 0
  let pttRetriesLeft = 0
  let detachData: (() => void) | null = null
  let detachStatus: (() => void) | null = null
  let pumpTimer: ReturnType<typeof setInterval> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(snapshot: RadioSnapshot) => void>()
  let cachedSnapshot: RadioSnapshot = {
    linkStatus,
    frequency,
    mode,
    tx,
    pendingFrequency: false,
    pendingMode: false,
    lastError: null,
    extended,
    meter,
    volume,
    agc,
    nr,
  }

  const getSnapshot = (): RadioSnapshot => cachedSnapshot

  // Actividad: órdenes del usuario o cambios hechos en la propia radio (girar el dial).
  const touch = () => {
    lastActivityAt = Date.now()
  }

  const emit = () => {
    cachedSnapshot = {
      linkStatus,
      frequency,
      mode,
      tx,
      pendingFrequency: intentFrequency !== null,
      pendingMode: intentMode !== null,
      lastError,
      extended,
      meter,
      volume,
      agc,
      nr,
    }
    listeners.forEach((listener) => listener(cachedSnapshot))
  }

  const reconcile = (polledFrequency: Frequency | null, polledMode: RadioMode | null) => {
    let changed = false
    if (polledFrequency !== null) {
      if (intentFrequency !== null) {
        if (polledFrequency === intentFrequency.value) {
          intentFrequency = null
          changed = true
        }
      } else if (frequency !== polledFrequency) {
        frequency = polledFrequency
        changed = true
        touch()
      }
    }
    if (polledMode !== null) {
      if (intentMode !== null) {
        if (polledMode === intentMode.value) {
          intentMode = null
          changed = true
        }
      } else if (mode !== polledMode) {
        mode = polledMode
        changed = true
        touch()
      }
    }
    if (changed) emit()
  }

  const handleFrame = (frame: string) => {
    const response = parseFrame(frame)
    switch (response.type) {
      case 'identify':
      case 'power-state':
        if (linkStatus !== 'connected') {
          linkStatus = 'connected'
          if (extended) {
            queue.push({ kind: 'volume-get' }, { kind: 'agc-get' }, { kind: 'nr-get' })
          }
          emit()
        }
        break
      case 'frequency':
        reconcile(response.frequency, null)
        break
      case 'ptt-off':
        // RX0 solo responde a nuestro RX: confirma la suelta y corta los reintentos.
        // Si entretanto se volvió a pulsar PTT, es una respuesta atrasada y no anula el TX.
        pttRetryAt = 0
        pttRetriesLeft = 0
        break
      case 'mode':
        reconcile(null, response.mode)
        break
      case 'state':
        reconcile(response.frequency, response.mode)
        break
      case 'meter':
        if (extended && response.meter !== meter) {
          meter = response.meter
          emit()
        }
        break
      case 'volume':
        volume = response.volume
        emit()
        break
      case 'agc':
        agc = response.agc
        emit()
        break
      case 'nr':
        nr = response.nr
        emit()
        break
      default:
        break
    }
  }

  const handleData = (chunk: string) => {
    const { frames, rest } = extractFrames(partial + chunk)
    partial = rest.length > MAX_PARTIAL_BUFFER ? '' : rest
    frames.forEach(handleFrame)
  }

  const resendPttOff = () => {
    if (pttRetryAt === 0 || tx || linkStatus !== 'connected') return
    const now = Date.now()
    if (now < pttRetryAt) return
    if (pttRetriesLeft <= 0) {
      pttRetryAt = 0
      return
    }
    pttRetriesLeft -= 1
    pttRetryAt = now + pttRetryMs
    queue.push({ kind: 'ptt-off' })
  }

  const pump = () => {
    resendPttOff()
    if (queue.length === 0) return
    const now = Date.now()
    if (now - lastSentAt < minFrameGapMs) return
    const command = queue.shift() as CatCommand
    lastSentAt = now
    if (command.kind === 'frequency-set' && intentFrequency?.value === command.frequency) {
      intentFrequency.sentAt = now
    }
    if (command.kind === 'mode-set' && intentMode?.value === command.mode) {
      intentMode.sentAt = now
    }
    link.send(encodeFrame(command))
  }

  const retryExpiredIntents = () => {
    const now = Date.now()
    if (intentFrequency !== null && now - intentFrequency.sentAt > retryAfterMs) {
      intentFrequency = { value: intentFrequency.value, sentAt: now }
      queue.push({ kind: 'frequency-set', frequency: intentFrequency.value })
    }
    if (intentMode !== null && now - intentMode.sentAt > retryAfterMs) {
      intentMode = { value: intentMode.value, sentAt: now }
      queue.push({ kind: 'mode-set', mode: intentMode.value })
    }
  }

  const poll = () => {
    // Transmitiendo no se sondea: cada trama es ruido y el estado no cambia.
    if (linkStatus !== 'connected' || queue.length > 0 || tx) return
    const now = Date.now()
    const active = tx || intentFrequency !== null || intentMode !== null || now - lastActivityAt < activeWindowMs
    if (!active && now - lastPollAt < idlePollIntervalMs) return
    lastPollAt = now
    retryExpiredIntents()
    pollTick += 1
    if (extended && pollTick % 2 === 0) {
      queue.push({ kind: 'meter-get' })
      return
    }
    queue.push({ kind: 'state-get' })
  }

  // El PTT se adelanta a todo lo pendiente (en FT8 el inicio de la emisión va a la
  // décima) y sustituye a la orden de PTT anterior sin enviar: solo cuenta la última.
  const isPtt = (command: CatCommand) => command.kind === 'ptt-on' || command.kind === 'ptt-off'
  const enqueue = (command: CatCommand) => {
    if (isPtt(command)) {
      queue = [command, ...queue.filter((queued) => !isPtt(queued))]
      return
    }
    queue = queue.filter((queued) => queued.kind !== command.kind).concat(command)
  }

  const start = async (path?: string) => {
    if (linkStatus !== 'disconnected') return
    lastError = null
    linkStatus = 'connecting'
    detachData ??= link.onData(handleData)
    detachStatus ??= link.onStatusChange((status) => {
      if (linkStatus === status) return
      if (status === 'connected') {
        lastError = null
        if (extended) {
          queue.push({ kind: 'volume-get' }, { kind: 'agc-get' }, { kind: 'nr-get' })
        }
      }
      linkStatus = status
      emit()
    })
    emit()
    try {
      await link.open(path === undefined ? undefined : { path })
    } catch (error) {
      linkStatus = 'disconnected'
      lastError = error instanceof Error ? error.message : String(error)
      emit()
      return
    }
    enqueue({ kind: 'identify' })
    touch()
    pumpTimer = setInterval(pump, PUMP_TICK_MS)
    pollTimer = setInterval(poll, pollIntervalMs)
    emit()
  }

  const stop = () => {
    if (pumpTimer) clearInterval(pumpTimer)
    if (pollTimer) clearInterval(pollTimer)
    pumpTimer = null
    pollTimer = null
    detachData?.()
    detachStatus?.()
    detachData = null
    detachStatus = null
    queue = []
    partial = ''
    intentFrequency = null
    intentMode = null
    pttRetryAt = 0
    pttRetriesLeft = 0
    lastError = null
    meter = null
    volume = null
    agc = null
    nr = null
    linkStatus = 'disconnected'
    void link.close()
    emit()
  }

  const requestFrequency = (value: number) => {
    touch()
    frequency = clampFrequency(value)
    intentFrequency = { value: frequency, sentAt: Date.now() }
    enqueue({ kind: 'frequency-set', frequency })
    enqueue({ kind: 'frequency-get' })
    emit()
  }

  const setVolume = (value: number) => {
    if (!extended || linkStatus === 'disconnected') return
    touch()
    volume = value
    enqueue({ kind: 'volume-set', volume: value })
    emit()
  }

  const setAgc = (value: number) => {
    if (!extended || linkStatus === 'disconnected') return
    touch()
    agc = value
    enqueue({ kind: 'agc-set', agc: value })
    emit()
  }

  const setNr = (value: number) => {
    if (!extended || linkStatus === 'disconnected') return
    touch()
    nr = value
    enqueue({ kind: 'nr-set', nr: value })
    emit()
  }

  const requestMode = (value: RadioMode) => {
    touch()
    mode = value
    intentMode = { value, sentAt: Date.now() }
    enqueue({ kind: 'mode-set', mode: value })
    enqueue({ kind: 'mode-get' })
    emit()
  }

  const pttOn = () => {
    touch()
    tx = true
    pttRetryAt = 0
    pttRetriesLeft = 0
    enqueue({ kind: 'ptt-on' })
    emit()
  }

  const pttOff = () => {
    touch()
    tx = false
    enqueue({ kind: 'ptt-off' })
    if (linkStatus === 'connected') {
      pttRetriesLeft = 2
      pttRetryAt = Date.now() + pttRetryMs
    }
    emit()
  }

  const clearRit = () => {
    touch()
    enqueue({ kind: 'rit-clear' })
  }

  return {
    start,
    stop,
    requestFrequency,
    requestMode,
    pttOn,
    pttOff,
    clearRit,
    setVolume,
    setAgc,
    setNr,
    subscribe(listener: (snapshot: RadioSnapshot) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot,
  }
}

export type RadioSession = ReturnType<typeof createRadioSession>
