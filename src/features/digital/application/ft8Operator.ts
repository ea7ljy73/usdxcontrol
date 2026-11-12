import { t } from '@/i18n/i18n'
import { CLEAR_GAP_HZ, findClearFrequency } from '../domain/clearFrequency'
import type { DigiDecode } from '../domain/decodeList'
import {
  answerCq,
  fmtReport,
  initialQso,
  onDecoded,
  onTxSent,
  startCq,
  stopQso,
  txMessage,
  type QsoPhase,
  type QsoState,
} from '../domain/ft8qso'
import type { LogEntry } from '../domain/logbook'
import { isEncodableMessage, standardMessages, type StdMessageId } from '../domain/messages'
import {
  nextTxSlot,
  oppositeParity,
  slotIndex,
  slotLengthMs,
  slotParity,
  slotStartMs,
  TX_START_OFFSET_MS,
  type SlotParity,
} from '../domain/slots'
import type { DigiClock } from './digiClock'
import type { DigiReceiver } from './digiReceiver'
import type { DigiTransmitter, KeyValueStore, LogbookRepository, PttControl, TxHandle } from './ports'

export type OperatorSettings = {
  myCall: string
  myGrid: string
  // Tono de audio de nuestra emisión (marcador rojo de la cascada).
  toneHz: number
  // Frecuencia de audio que escuchamos (marcador verde y panel Rx Frequency).
  rxHz: number
  // Hold Tx Freq: al contestar o mover el RX, el tono de TX se queda donde está.
  holdTxFreq: boolean
  // Al llamar CQ o contestar, si el tono de TX pisa otra señal se lleva antes a un hueco libre.
  autoClearTx: boolean
  // Call 1st: tras nuestro CQ se contesta sola a la primera estación que llama.
  callFirst: boolean
  txParity: SlotParity
  // Contesta solo siguiendo la secuencia del QSO.
  autoSeq: boolean
  // Cierra con 73 en lugar de RR73.
  use73: boolean
  // Responde en la secuencia contraria a la de la otra estación.
  autoSlot: boolean
  // Vigilante de WSJT-X: deja de transmitir tras estos minutos repitiendo lo mismo.
  txWatchdogMin: number
}

export type TxStatus = {
  phase: 'idle' | 'scheduled' | 'on-air'
  message: string | null
  slotStartMs: number | null
}

export type Notice = { id: number; tone: 'info' | 'success' | 'error'; text: string }

export type LogDraft = Omit<LogEntry, 'id'>

export type OperatorState = {
  settings: OperatorSettings
  qso: QsoState
  dxCall: string
  dxGrid: string
  // Reporte que nos ha dado la otra estación.
  reportRcvd: number | null
  txOverride: string
  txEnabled: boolean
  // Mensaje elegido a mano para el próximo ciclo propio (una sola vez).
  oneShot: string | null
  tx: TxStatus
  // Tune: portadora continua en el tono de TX para ajustar la potencia.
  tuning: boolean
  waiting: string[]
  restored: boolean
  notices: Notice[]
  logDraft: LogDraft | null
  logbook: LogEntry[]
}

export const DEFAULT_SETTINGS: OperatorSettings = {
  myCall: '',
  myGrid: '',
  toneHz: 1_000,
  rxHz: 1_000,
  holdTxFreq: false,
  autoClearTx: true,
  callFirst: true,
  txParity: 'odd',
  autoSeq: true,
  use73: false,
  autoSlot: true,
  txWatchdogMin: 6,
}

// Tono de TX dentro de lo que el uSDX puede emitir: muestrea el audio de TX a 4800 Hz,
// así que por encima de 2400 Hz la señal se refleja (sale invertida y nadie la decodifica).
// La señal ocupa 50 Hz en FT8 y 83 Hz en FT4 sobre el tono base: tope en 2300 Hz.
export const MAX_TX_TONE_HZ = 2_300
const clampTone = (hz: number) => Math.min(MAX_TX_TONE_HZ, Math.max(200, Math.round(hz)))

const ACTIVE: QsoPhase[] = ['cq', 'call', 'report', 'roger', 'rr73']
const SEQUENCE: Record<'me' | 'them', QsoPhase[]> = {
  me: ['cq', 'report', 'rr73', 'done'],
  them: ['call', 'roger', 'rr73', 'done'],
}
const QSO_MAX_AGE_MS = 4 * 3_600_000
const PTT_LEAD_MS = 300
const PTT_TAIL_MS = 120
const MAX_NOTICES = 4
// Tune no se queda puesto: se corta solo pasado este tiempo.
export const TUNE_MAX_MS = 60_000

type Options = {
  receiver: DigiReceiver
  transmitter: DigiTransmitter
  ptt: PttControl
  clock: DigiClock
  store: KeyValueStore
  logbook: LogbookRepository
  // Frecuencia de dial de la radio (para el libro) y si se puede transmitir.
  dialHz: () => number | null
  canTransmit: () => boolean
  tickMs?: number
}

type StoredQso = { qso: QsoState; dxCall: string; dxGrid: string; reportRcvd: number | null; startedAt: string | null; ts: number }

// Operador FT8 al estilo WSJT-X: decide qué y cuándo transmitir en cada ciclo,
// gobierna el PTT y lleva la secuencia del QSO hasta el libro de guardia.
export const createFt8Operator = ({
  receiver,
  transmitter,
  ptt,
  clock,
  store,
  logbook,
  dialHz,
  canTransmit,
  tickMs = 200,
}: Options) => {
  const settings: OperatorSettings = { ...DEFAULT_SETTINGS, ...(store.get<Partial<OperatorSettings>>('digi.settings') ?? {}) }
  // Un tono guardado con un tope anterior (hasta 2900 Hz) se trae al rango que el uSDX puede emitir.
  settings.toneHz = clampTone(settings.toneHz)
  let state: OperatorState = {
    settings,
    qso: initialQso(settings.myCall, settings.myGrid),
    dxCall: '',
    dxGrid: '',
    reportRcvd: null,
    txOverride: '',
    txEnabled: false,
    oneShot: null,
    tx: { phase: 'idle', message: null, slotStartMs: null },
    tuning: false,
    waiting: [],
    restored: false,
    notices: [],
    logDraft: null,
    logbook: logbook.list(),
  }
  let qsoStartedAt: string | null = null
  // Reporte que hemos transmitido de verdad (el que va al libro como RST enviado).
  let reportSent: string | null = null
  let decodedSlot = Number.NEGATIVE_INFINITY
  let lastTxSlot = Number.NEGATIVE_INFINITY
  let handle: TxHandle | null = null
  let txTimers: ReturnType<typeof setTimeout>[] = []
  let generation = 0
  let watchdogSince: number | null = null
  let watchdogKey = ''
  let noticeId = 0
  let tuneHandle: { stop(): void } | null = null
  let tunePtt = false
  let tuneTimer: ReturnType<typeof setTimeout> | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(state: OperatorState) => void>()

  const persistQso = () => {
    const { qso } = state
    if (!ACTIVE.includes(qso.phase)) {
      store.remove('digi.qso')
      return
    }
    store.set('digi.qso', {
      qso,
      dxCall: state.dxCall,
      dxGrid: state.dxGrid,
      reportRcvd: state.reportRcvd,
      startedAt: qsoStartedAt,
      ts: clock.now(),
    } satisfies StoredQso)
  }

  let rememberedKey = ''
  const update = (patch: Partial<OperatorState>) => {
    state = { ...state, ...patch }
    // El decodificador conoce nuestro indicativo y el del DX para resolver los abreviados (<...>).
    const key = `${state.settings.myCall}|${state.dxCall}`
    if (key !== rememberedKey) {
      rememberedKey = key
      receiver.rememberCallsigns([state.settings.myCall, state.dxCall])
    }
    if ('qso' in patch || 'dxCall' in patch || 'dxGrid' in patch) persistQso()
    if ('settings' in patch) store.set('digi.settings', state.settings)
    listeners.forEach((listener) => listener(state))
  }

  const notify = (text: string, tone: Notice['tone'] = 'info') => {
    noticeId += 1
    update({ notices: [...state.notices, { id: noticeId, tone, text }].slice(-MAX_NOTICES) })
  }

  // El QSO lleva siempre los datos de la estación al día.
  const withStation = (qso: QsoState): QsoState => ({
    ...qso,
    myCall: state.settings.myCall.toUpperCase(),
    myGrid: (state.settings.myGrid || '----').toUpperCase().slice(0, 4),
    use73: state.settings.use73,
  })

  const draftFor = (qso: QsoState): LogDraft => ({
    myCall: state.settings.myCall.toUpperCase(),
    myGrid: state.settings.myGrid.toUpperCase(),
    call: qso.partner || state.dxCall,
    grid: qso.theirGrid || state.dxGrid,
    dialHz: dialHz() ?? 0,
    toneHz: state.settings.toneHz,
    mode: receiver.getState().mode,
    rstSent: reportSent ?? fmtReport(qso.report),
    rstRcvd: state.reportRcvd === null ? '' : fmtReport(state.reportRcvd),
    startedAt: qsoStartedAt ?? new Date(clock.now()).toISOString(),
    endedAt: new Date(clock.now()).toISOString(),
    notes: '',
  })

  const applyQso = (next: QsoState, extra: Partial<OperatorState> = {}) => {
    const entered = next.phase === 'done' && state.qso.phase !== 'done'
    update({
      qso: next,
      dxCall: next.partner || state.dxCall,
      dxGrid: next.theirGrid || state.dxGrid,
      ...extra,
    })
    if (entered) {
      // Como WSJT-X: al terminar se deja de transmitir y se propone guardar el QSO.
      notify(t('operator.qsoComplete', { call: next.partner || state.dxCall }), 'success')
      update({ txEnabled: false, logDraft: draftFor(next) })
      qsoStartedAt = null
      reportSent = null
    }
  }

  const clearTxTimers = () => {
    txTimers.forEach(clearTimeout)
    txTimers = []
  }

  const releaseTx = () => {
    clearTxTimers()
    handle = null
    update({ tx: { phase: 'idle', message: null, slotStartMs: null } })
  }

  const desiredMessage = (): string | null => {
    if (state.oneShot) return state.oneShot
    if (!state.txEnabled) return null
    const override = state.txOverride.trim().toUpperCase()
    return override || txMessage(withStation(state.qso))
  }

  const stopForError = (text: string) => {
    notify(text, 'error')
    update({ txEnabled: false, oneShot: null })
  }

  const begin = async (index: number, message: string) => {
    const mode = receiver.getState().mode
    lastTxSlot = index
    const start = slotStartMs(index, mode)
    const startUtc = Math.max(start + TX_START_OFFSET_MS, clock.now() + 200)
    const startLocal = clock.toLocal(startUtc)
    const wasOneShot = message === state.oneShot
    const own = ++generation
    update({ oneShot: wasOneShot ? null : state.oneShot, tx: { phase: 'scheduled', message, slotStartMs: start } })
    let opened: TxHandle
    try {
      opened = await transmitter.transmit({ mode, message, toneHz: state.settings.toneHz, startAtMs: startLocal, slotIndex: index })
    } catch (error) {
      if (own !== generation) return
      releaseTx()
      stopForError(t('operator.txFailed', { message, error: error instanceof Error ? error.message : String(error) }))
      return
    }
    if (own !== generation) {
      opened.cancel()
      return
    }
    handle = opened
    const lead = startLocal - PTT_LEAD_MS - transmitter.outputLatencyMs() - Date.now()
    txTimers.push(setTimeout(() => ptt.on(), Math.max(0, lead)))
    // Vigilante: si el audio no avisa de que ha terminado, se suelta el PTT igualmente.
    txTimers.push(
      setTimeout(() => {
        if (own !== generation) return
        ptt.off()
        opened.cancel()
        releaseTx()
      }, startLocal - Date.now() + slotLengthMs(mode)),
    )
    void opened.started.then(() => {
      if (own !== generation) return
      qsoStartedAt ??= new Date(clock.now()).toISOString()
      const report = /\sR?([+-]\d{2})$/.exec(message)
      if (report) reportSent = report[1]
      receiver.addTxEcho(message, start, state.settings.toneHz)
      update({ tx: { phase: 'on-air', message, slotStartMs: start } })
    })
    void opened.ended.then(() => {
      if (own !== generation) return
      setTimeout(() => ptt.off(), transmitter.outputLatencyMs() + PTT_TAIL_MS)
      releaseTx()
      const after = onTxSent(withStation(state.qso))
      if (after.state.phase !== state.qso.phase) applyQso(after.state)
    })
  }

  const checkWatchdog = (now: number) => {
    const key = `${state.qso.phase}|${state.qso.partner}|${state.txOverride}`
    if (!state.txEnabled) {
      watchdogSince = null
      return
    }
    if (watchdogSince === null || key !== watchdogKey) {
      watchdogSince = now
      watchdogKey = key
      return
    }
    if (now - watchdogSince > state.settings.txWatchdogMin * 60_000) {
      watchdogSince = null
      notify(t('operator.watchdog', { minutes: state.settings.txWatchdogMin }), 'error')
      update({ txEnabled: false })
    }
  }

  const tick = () => {
    const now = clock.now()
    checkWatchdog(now)
    if (state.tuning || handle || state.tx.phase !== 'idle') return
    const mode = receiver.getState().mode
    const index = nextTxSlot(now, mode, state.settings.txParity)
    if (index <= lastTxSlot) return
    const start = slotStartMs(index, mode)
    // Se decide con lo decodificado del ciclo anterior o, si no llega, ya empezado el propio.
    if (decodedSlot < index - 1 && now < start + 300) return
    const message = desiredMessage()
    if (!message) return
    if (!canTransmit()) {
      lastTxSlot = index
      stopForError(t('operator.connectRadio'))
      return
    }
    if (!isEncodableMessage(message)) {
      lastTxSlot = index
      stopForError(t('operator.invalidMessage', { message, mode }))
      return
    }
    void begin(index, message)
  }

  // Como WSJT-X 2.7: al contestar o hacer clic el RX va a la estación y el TX se queda donde
  // está (no se transmite encima del DX). Con Ctrl se mueven los dos, salvo Hold Tx Freq.
  const followFrequency = (audioHz: number, moveTx = false): Partial<OperatorSettings> =>
    moveTx && !state.settings.holdTxFreq ? { rxHz: audioHz, toneHz: clampTone(audioHz) } : { rxHz: audioHz }

  // Antes de empezar a transmitir (CQ o llamada): si el TX pisa otra señal, a un hueco libre.
  const autoClear = () => {
    if (state.settings.autoClearTx && !state.settings.holdTxFreq) moveToClear(false)
  }

  // Lleva el tono de TX al hueco más limpio según lo decodificado en los últimos minutos.
  const moveToClear = (announce: boolean) => {
    const { decodes, mode } = receiver.getState()
    const current = state.settings.toneHz
    const found = findClearFrequency({ decodes, mode, nowMs: clock.now(), currentHz: current })
    if (found.busy === 0) {
      if (announce) notify(t('operator.clearNoDecodes'))
      return
    }
    if (found.hz !== current) update({ settings: { ...state.settings, toneHz: clampTone(found.hz) } })
    if (!announce && found.hz === current) return
    const clean = found.gapHz >= CLEAR_GAP_HZ
    notify(
      found.hz === current
        ? t(clean ? 'operator.clearStay' : 'operator.clearStayNear', { hz: current, gap: found.gapHz })
        : t(clean ? 'operator.clearMoved' : 'operator.clearMovedNear', { hz: found.hz, gap: found.gapHz }),
    )
  }

  const stopTune = () => {
    if (tuneTimer) clearTimeout(tuneTimer)
    tuneTimer = null
    tuneHandle?.stop()
    tuneHandle = null
    if (tunePtt) ptt.off()
    tunePtt = false
    if (state.tuning) update({ tuning: false })
  }

  const onSlot = ({ index, decodes }: { index: number; decodes: DigiDecode[] }) => {
    decodedSlot = index
    const my = state.settings.myCall.trim().toUpperCase()
    if (!my) return
    // Si llaman varias a la vez, se atiende a la más fuerte y el resto espera.
    let handled = false
    for (const decode of [...decodes].sort((a, b) => b.snrDb - a.snrDb)) {
      const parsed = decode.parsed
      if (!parsed || parsed.kind !== 'qso' || parsed.toCall !== my || !parsed.fromCall) continue
      const busy = handled || (ACTIVE.includes(state.qso.phase) && state.qso.partner !== '')
      // Otra estación nos llama en mitad de un QSO: a la cola, como en WSJT-X.
      if (busy && parsed.fromCall !== state.qso.partner) {
        if (!state.waiting.includes(parsed.fromCall)) {
          update({ waiting: [...state.waiting, parsed.fromCall] })
          notify(t('operator.callingYouWaiting', { call: parsed.fromCall }))
        }
        continue
      }
      // Sin Call 1st, quien contesta a nuestro CQ espera a que lo elijamos (doble clic).
      if (state.qso.phase === 'cq' && !state.settings.callFirst) {
        if (!state.waiting.includes(parsed.fromCall)) {
          update({ waiting: [...state.waiting, parsed.fromCall] })
          notify(t('operator.answersCq', { call: parsed.fromCall }))
        }
        continue
      }
      const transition = onDecoded(withStation(state.qso), parsed, decode.snrDb)
      if (!transition) continue
      const extra: Partial<OperatorState> = {}
      if (parsed.report !== undefined) extra.reportRcvd = parsed.report
      // Tras nuestro CQ el RX sigue a quien contesta; seguimos transmitiendo en nuestra frecuencia.
      if (state.qso.phase === 'cq') extra.settings = { ...(extra.settings ?? state.settings), rxHz: decode.audioHz }
      if (state.settings.autoSlot) {
        extra.settings = { ...(extra.settings ?? state.settings), txParity: oppositeParity(slotParity(index)) }
      }
      // Secuencia automática: quien nos contesta recibe respuesta sin tocar nada.
      if (state.settings.autoSeq && ACTIVE.includes(transition.state.phase)) extra.txEnabled = true
      applyQso(transition.state, extra)
      handled = true
    }
  }

  type CallOptions = { grid?: string; decodedSlotStartMs?: number | null; audioHz?: number | null; moveTx?: boolean; clear?: boolean }

  const call = (callsign: string, { grid = '', decodedSlotStartMs = null, audioHz = null, moveTx = false, clear = true }: CallOptions = {}) => {
    if (clear && !moveTx) autoClear()
    const extra: Partial<OperatorState> = { txEnabled: true, dxCall: callsign.toUpperCase(), dxGrid: grid.toUpperCase(), reportRcvd: null }
    if (audioHz !== null) extra.settings = { ...state.settings, ...followFrequency(audioHz, moveTx) }
    if (state.settings.autoSlot && decodedSlotStartMs !== null) {
      const index = slotIndex(decodedSlotStartMs, receiver.getState().mode)
      extra.settings = { ...(extra.settings ?? state.settings), txParity: oppositeParity(slotParity(index)) }
    }
    qsoStartedAt = null
    reportSent = null
    applyQso(answerCq(withStation(state.qso), callsign, grid), extra)
    notify(
      t('operator.calling', {
        call: callsign.toUpperCase(),
        parity: (extra.settings ?? state.settings).txParity === 'odd' ? t('digital.qso.odd') : t('digital.qso.even'),
      }),
    )
  }

  const restore = () => {
    const saved = store.get<StoredQso>('digi.qso')
    if (!saved || clock.now() - saved.ts > QSO_MAX_AGE_MS || !ACTIVE.includes(saved.qso.phase)) {
      store.remove('digi.qso')
      return
    }
    qsoStartedAt = saved.startedAt
    state = {
      ...state,
      qso: withStation(saved.qso),
      dxCall: saved.dxCall,
      dxGrid: saved.dxGrid,
      reportRcvd: saved.reportRcvd,
      restored: true,
    }
  }
  restore()
  rememberedKey = `${state.settings.myCall}|${state.dxCall}`
  receiver.rememberCallsigns([state.settings.myCall, state.dxCall])

  return {
    start() {
      timer ??= setInterval(tick, tickMs)
      const detach = receiver.onSlotDecoded(onSlot)
      return () => {
        detach()
        if (timer) clearInterval(timer)
        timer = null
      }
    },
    updateSettings(patch: Partial<OperatorSettings>) {
      const next = { ...state.settings, ...patch }
      next.myCall = next.myCall.toUpperCase().trim()
      next.myGrid = next.myGrid.toUpperCase().trim()
      update({ settings: next, qso: { ...state.qso, myCall: next.myCall, myGrid: next.myGrid, use73: next.use73 } })
    },
    setDx(dxCall: string, dxGrid: string) {
      update({ dxCall: dxCall.toUpperCase().trim(), dxGrid: dxGrid.toUpperCase().trim() })
    },
    setTxOverride: (text: string) => update({ txOverride: text.toUpperCase() }),
    setTxEnabled(enabled: boolean) {
      if (!enabled) {
        update({ txEnabled: false })
        return
      }
      if (!state.settings.myCall) {
        notify(t('operator.needCallTx'), 'error')
        return
      }
      transmitter.prepare()
      if (state.txOverride.trim() || txMessage(withStation(state.qso))) {
        update({ txEnabled: true })
        return
      }
      // Sin QSO en marcha, como WSJT-X: se llama a la estación DX elegida o se lanza CQ.
      if (state.dxCall) {
        call(state.dxCall, { grid: state.dxGrid })
        return
      }
      qsoStartedAt = null
      reportSent = null
      applyQso(startCq(withStation(state.qso)), { txEnabled: true, reportRcvd: null })
    },
    // Tx6 · CQ: llamar general y repetir en cada ciclo propio.
    callCq() {
      if (!state.settings.myCall) {
        notify(t('operator.needCallCq'), 'error')
        return
      }
      transmitter.prepare()
      if (state.qso.phase !== 'cq') autoClear()
      qsoStartedAt = null
      reportSent = null
      applyQso(startCq(withStation(state.qso)), { txEnabled: true, reportRcvd: null })
    },
    // Buscar hueco: mueve el TX a la zona más despejada de la banda.
    findClearTx() {
      moveToClear(true)
    },
    // Doble clic en una línea: contestar a un CQ o seguir a quien nos llama.
    // Con Ctrl (moveTx) el TX también se va a su frecuencia, como en WSJT-X.
    answer(decode: DigiDecode, { moveTx = false }: { moveTx?: boolean } = {}) {
      const parsed = decode.parsed
      if (!parsed || decode.tx || !parsed.fromCall) return
      if (!state.settings.myCall) {
        notify(t('operator.needCallAnswer'), 'error')
        return
      }
      transmitter.prepare()
      if (parsed.kind === 'qso' && parsed.toCall === state.settings.myCall) {
        const transition = onDecoded(withStation(state.qso), parsed, decode.snrDb)
        if (transition) {
          const extra: Partial<OperatorState> = { txEnabled: true, settings: { ...state.settings, ...followFrequency(decode.audioHz, moveTx) } }
          if (parsed.report !== undefined) extra.reportRcvd = parsed.report
          if (state.settings.autoSlot) {
            const index = slotIndex(decode.slotStartMs, decode.mode)
            extra.settings = { ...(extra.settings ?? state.settings), txParity: oppositeParity(slotParity(index)) }
          }
          update({ waiting: state.waiting.filter((entry) => entry !== parsed.fromCall) })
          applyQso(transition.state, extra)
          return
        }
      }
      call(parsed.fromCall, { grid: parsed.grid ?? '', decodedSlotStartMs: decode.slotStartMs, audioHz: decode.audioHz, moveTx })
    },
    // Clic en una línea: la estación pasa a ser la DX.
    select(decode: DigiDecode) {
      const parsed = decode.parsed
      if (!parsed?.fromCall || decode.tx) return
      update({ dxCall: parsed.fromCall, dxGrid: parsed.grid ?? (parsed.fromCall === state.dxCall ? state.dxGrid : '') })
    },
    callDx() {
      if (!state.dxCall) return
      transmitter.prepare()
      call(state.dxCall, { grid: state.dxGrid })
    },
    // Tx1–Tx6 y "Enviar": un mensaje suelto en el próximo ciclo propio.
    sendStandard(id: StdMessageId) {
      const message = standardMessages({
        myCall: state.settings.myCall,
        myGrid: state.settings.myGrid,
        dxCall: state.dxCall,
        reportDb: state.qso.report,
      }).find((entry) => entry.id === id)?.text
      if (!message) {
        notify(t('operator.needBothCalls'), 'error')
        return
      }
      transmitter.prepare()
      update({ oneShot: message })
    },
    sendNow() {
      const message =
        state.txOverride.trim() ||
        txMessage(withStation(state.qso)) ||
        standardMessages({ myCall: state.settings.myCall, myGrid: state.settings.myGrid, dxCall: state.dxCall, reportDb: state.qso.report })[5].text
      if (!message) {
        notify(t('operator.needCallTx'), 'error')
        return
      }
      transmitter.prepare()
      update({ oneShot: message.toUpperCase() })
    },
    // Halt TX: corta ya la emisión y suelta el PTT.
    // Rx: clic en la cascada. Ctrl + clic mueve también el TX (salvo Hold Tx Freq).
    setRxHz(hz: number, { moveTx = false }: { moveTx?: boolean } = {}) {
      update({ settings: { ...state.settings, ...followFrequency(Math.round(hz), moveTx) } })
    },
    // Mayús + F11 / F12 de WSJT-X: baja o sube el TX 60 Hz en FT8 y 90 Hz en FT4.
    nudgeTx(direction: 1 | -1) {
      const step = receiver.getState().mode === 'FT8' ? 60 : 90
      update({ settings: { ...state.settings, toneHz: clampTone(state.settings.toneHz + direction * step) } })
    },
    // Tx: Mayús + clic en la cascada.
    setTxHz(hz: number) {
      update({ settings: { ...state.settings, toneHz: clampTone(hz) } })
    },
    async tune(on: boolean) {
      if (!on) {
        stopTune()
        return
      }
      if (state.tuning) return
      if (!canTransmit()) {
        notify(t('operator.connectRadio'), 'error')
        return
      }
      transmitter.prepare()
      generation += 1
      handle?.cancel()
      releaseTx()
      update({ tuning: true, txEnabled: false, oneShot: null })
      let opened: { stop(): void }
      try {
        opened = await transmitter.tune(state.settings.toneHz)
      } catch (error) {
        update({ tuning: false })
        notify(t('operator.toneFailed', { error: error instanceof Error ? error.message : String(error) }), 'error')
        return
      }
      if (!state.tuning) {
        opened.stop()
        return
      }
      tuneHandle = opened
      tunePtt = true
      ptt.on()
      tuneTimer = setTimeout(() => {
        stopTune()
        notify(t('operator.tuneStopped', { seconds: TUNE_MAX_MS / 1_000 }))
      }, TUNE_MAX_MS)
    },
    haltTx() {
      stopTune()
      generation += 1
      handle?.cancel()
      ptt.off()
      releaseTx()
      update({ txEnabled: false, oneShot: null })
    },
    resetQso() {
      qsoStartedAt = null
      update({ qso: stopQso(withStation(state.qso)), dxCall: '', dxGrid: '', reportRcvd: null, restored: false, txOverride: '' })
    },
    // "Siguiente paso" y "Reiniciar secuencia" a mano cuando se pierde un mensaje.
    advancePhase() {
      const order = SEQUENCE[state.qso.initiator ?? 'me']
      const at = order.indexOf(state.qso.phase)
      applyQso({ ...state.qso, phase: order[Math.min(order.length - 1, at + 1)] })
    },
    restartSequence() {
      const initiator = state.qso.initiator ?? 'me'
      applyQso({ ...state.qso, initiator, phase: SEQUENCE[initiator][0] })
    },
    addWaiting(callsign = state.dxCall) {
      const value = callsign.trim().toUpperCase()
      if (!value || state.waiting.includes(value)) return
      update({ waiting: [...state.waiting, value] })
    },
    serveNextWaiting() {
      const [next, ...rest] = state.waiting
      if (!next) return
      update({ waiting: rest })
      // Atendiendo a quien contesta a nuestro CQ: el TX se queda en nuestra frecuencia.
      call(next, { clear: false })
    },
    removeWaiting: (callsign: string) => update({ waiting: state.waiting.filter((entry) => entry !== callsign) }),
    dismissNotice: (id: number) => update({ notices: state.notices.filter((notice) => notice.id !== id) }),
    prepareLog() {
      if (!(state.qso.partner || state.dxCall)) {
        notify(t('operator.needLogCall'), 'error')
        return
      }
      update({ logDraft: draftFor(state.qso) })
    },
    saveLog(entry: LogDraft) {
      const saved: LogEntry = { ...entry, id: `${entry.endedAt}-${entry.call}`, call: entry.call.toUpperCase() }
      const entries = [saved, ...state.logbook]
      logbook.save(entries)
      update({ logbook: entries, logDraft: null })
      notify(t('operator.logSaved', { call: saved.call }), 'success')
    },
    discardLog: () => update({ logDraft: null }),
    deleteLogEntry(id: string) {
      const entries = state.logbook.filter((entry) => entry.id !== id)
      logbook.save(entries)
      update({ logbook: entries })
    },
    importLog(entries: LogEntry[]) {
      const known = new Set(state.logbook.map((entry) => entry.id))
      const added = entries.filter((entry) => !known.has(entry.id))
      const merged = [...state.logbook, ...added].sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      logbook.save(merged)
      update({ logbook: merged })
      notify(t('operator.imported', { count: added.length }), 'success')

    },
    notify,
    subscribe(listener: (state: OperatorState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getState: () => state,
  }
}

export type Ft8Operator = ReturnType<typeof createFt8Operator>
