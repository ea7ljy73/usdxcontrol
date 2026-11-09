import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawDecode } from '../domain/decodeList'
import type { LogEntry } from '../domain/logbook'
import { createDigiClock } from './digiClock'
import { createDigiReceiver } from './digiReceiver'
import { createFt8Operator } from './ft8Operator'
import type { DigiAudioInput, DigiTransmitter, KeyValueStore, TxRequest } from './ports'

const at = (hms: string) => Date.parse(`2026-10-25T${hms}Z`)
const T0 = at('12:34:50')

const memoryStore = (): KeyValueStore => {
  const data = new Map<string, unknown>()
  return {
    get: <T,>(key: string) => (data.has(key) ? (structuredClone(data.get(key)) as T) : null),
    set: (key, value) => void data.set(key, structuredClone(value)),
    remove: (key) => void data.delete(key),
  }
}

const input: DigiAudioInput = {
  sampleRate: 12_000,
  read: (from, to) => new Float32Array(((to - from) * 12_000) / 1_000),
  stop: () => undefined,
  spectrum: () => null,
  levelDb: () => -60,
  setGain: () => undefined,
  setMonitor: () => undefined,
}

// Transmisor falso: "suena" a su hora y dura lo que una emisión FT8 (12,64 s).
const fakeTransmitter = () => {
  const sent: { request: TxRequest; startedAt: number }[] = []
  const transmitter: DigiTransmitter & { sent: typeof sent; cancelled: number } = {
    sent,
    cancelled: 0,
    async transmit(request) {
      let cancel = () => undefined
      const started = new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          sent.push({ request, startedAt: Date.now() })
          resolve()
        }, request.startAtMs - Date.now())
        cancel = () => {
          clearTimeout(id)
          transmitter.cancelled += 1
        }
      })
      const ended = started.then(() => new Promise<void>((resolve) => setTimeout(resolve, 12_640)))
      return { started, ended, cancel: () => cancel() }
    },
    levelDb: () => -60,
    prepare: () => undefined,
    tune: async () => ({ stop: () => undefined }),
    outputLatencyMs: () => 0,
    setOutput: () => undefined,
    setGain: () => undefined,
  }
  return transmitter
}

// Lo que "se oye" en cada ciclo (por hora UTC de inicio).
const scriptedBand = (script: Record<string, RawDecode[]>) => ({
  decode: async () => {
    const start = Math.floor((Date.now() - 14_000) / 15_000) * 15_000
    return script[new Date(start).toISOString().slice(11, 19)] ?? []
  },
})

const setup = (script: Record<string, RawDecode[]> = {}, store = memoryStore()) => {
  const clock = createDigiClock()
  const receiver = createDigiReceiver({ decoder: scriptedBand(script), input: async () => input, clock })
  const transmitter = fakeTransmitter()
  const ptt = { on: vi.fn(), off: vi.fn() }
  const saved: LogEntry[][] = []
  const operator = createFt8Operator({
    receiver,
    transmitter,
    ptt,
    clock,
    store,
    logbook: { list: () => [], save: (entries) => void saved.push(entries) },
    dialHz: () => 7_074_000,
    canTransmit: () => true,
  })
  operator.updateSettings({ myCall: 'ea7ljy', myGrid: 'IM76hk' })
  const detach = operator.start()
  return { receiver, transmitter, ptt, operator, saved, detach, store }
}

const messages = (transmitter: ReturnType<typeof fakeTransmitter>) => transmitter.sent.map((entry) => entry.request.message)

describe('operador FT8', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())

  it('QSO completo desde un CQ: reporte, RR73 y propuesta de libro', async () => {
    const { receiver, transmitter, ptt, operator } = setup({
      '12:35:30': [{ db: -12, dt: 0.1, df: 1500, text: 'EA7LJY F5BZB JN05' }],
      '12:36:00': [{ db: -11, dt: 0.1, df: 1500, text: 'EA7LJY F5BZB R-08' }],
    })
    await receiver.start()
    operator.callCq()
    expect(operator.getState().qso.phase).toBe('cq')

    await vi.advanceTimersByTimeAsync(at('12:35:29') - T0)
    expect(messages(transmitter)).toEqual(['CQ EA7LJY IM76'])
    // Empieza medio segundo después del inicio del ciclo impar (:15) y el PTT sube antes.
    expect(transmitter.sent[0].startedAt).toBe(at('12:35:15.500'))
    expect(ptt.on).toHaveBeenCalledTimes(1)
    expect(receiver.getState().decodes[0]).toMatchObject({ tx: true, text: 'CQ EA7LJY IM76' })

    await vi.advanceTimersByTimeAsync(at('12:36:30') - at('12:35:29'))
    expect(messages(transmitter)).toEqual(['CQ EA7LJY IM76', 'F5BZB EA7LJY -12', 'F5BZB EA7LJY RR73'])
    const state = operator.getState()
    expect(state.qso.phase).toBe('done')
    expect(state.txEnabled).toBe(false)
    expect(state.logDraft).toMatchObject({ call: 'F5BZB', grid: 'JN05', rstSent: '-12', rstRcvd: '-08', dialHz: 7_074_000 })
    expect(ptt.off).toHaveBeenCalled()

    operator.saveLog(state.logDraft!)
    expect(operator.getState().logbook[0].call).toBe('F5BZB')
  })

  it('Habilitar TX sin QSO en marcha lanza CQ, como WSJT-X', async () => {
    const { receiver, transmitter, ptt, operator } = setup()
    await receiver.start()
    operator.setTxEnabled(true)
    expect(operator.getState()).toMatchObject({ txEnabled: true, qso: { phase: 'cq' } })
    await vi.advanceTimersByTimeAsync(at('12:35:29') - T0)
    expect(messages(transmitter)).toEqual(['CQ EA7LJY IM76'])
    expect(ptt.on).toHaveBeenCalledTimes(1)
  })

  it('Habilitar TX con una estación DX elegida la llama (Tx1)', async () => {
    const { receiver, transmitter, operator } = setup()
    await receiver.start()
    operator.setDx('f5bzb', 'jn05')
    operator.setTxEnabled(true)
    expect(operator.getState().qso).toMatchObject({ phase: 'call', partner: 'F5BZB' })
    await vi.advanceTimersByTimeAsync(at('12:35:29') - T0)
    expect(messages(transmitter)).toEqual(['F5BZB EA7LJY IM76'])
  })

  it('contestar lleva el RX y el TX a la estación; con Hold Tx Freq el TX no se mueve', async () => {
    const { operator, receiver } = setup({ '12:34:45': [{ db: -5, dt: 0.1, df: 1_730, text: 'CQ F5BZB JN05' }] })
    await receiver.start()
    await vi.advanceTimersByTimeAsync(at('12:35:00') - T0)
    const cq = receiver.getState().decodes.find((d) => d.text === 'CQ F5BZB JN05')!
    operator.answer(cq)
    expect(operator.getState().settings).toMatchObject({ rxHz: 1_730, toneHz: 1_730 })

    operator.resetQso()
    operator.updateSettings({ holdTxFreq: true, toneHz: 900 })
    operator.answer(cq)
    expect(operator.getState().settings).toMatchObject({ rxHz: 1_730, toneHz: 900 })
    operator.setRxHz(2_000)
    expect(operator.getState().settings).toMatchObject({ rxHz: 2_000, toneHz: 900 })
    operator.setTxHz(5_000)
    expect(operator.getState().settings.toneHz).toBe(2_900)
  })

  it('sin Call 1st, quien contesta a nuestro CQ queda en espera', async () => {
    const { receiver, transmitter, operator } = setup({
      '12:35:30': [{ db: -12, dt: 0.1, df: 1500, text: 'EA7LJY F5BZB JN05' }],
    })
    await receiver.start()
    operator.updateSettings({ callFirst: false })
    operator.callCq()
    await vi.advanceTimersByTimeAsync(at('12:36:14') - T0)
    expect(operator.getState().waiting).toEqual(['F5BZB'])
    expect(operator.getState().qso.phase).toBe('cq')
    expect(messages(transmitter)).toEqual(['CQ EA7LJY IM76', 'CQ EA7LJY IM76'])
  })

  it('Tune: PTT con portadora, sin emisiones FT8, y se corta solo', async () => {
    const { transmitter, ptt, operator } = setup()
    const stop = vi.fn()
    transmitter.tune = async () => ({ stop })
    operator.callCq()
    await operator.tune(true)
    expect(operator.getState()).toMatchObject({ tuning: true, txEnabled: false })
    expect(ptt.on).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(messages(transmitter)).toEqual([])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(operator.getState().tuning).toBe(false)
    expect(stop).toHaveBeenCalled()
    expect(ptt.off).toHaveBeenCalledTimes(1)
  })

  it('contesta a un CQ en la secuencia contraria y sigue la secuencia', async () => {
    const { receiver, transmitter, operator } = setup({
      '12:35:30': [{ db: -9, dt: 0.1, df: 900, text: 'EA7LJY F5BZB -09' }],
      '12:36:00': [{ db: -9, dt: 0.1, df: 900, text: 'EA7LJY F5BZB RR73' }],
    })
    await receiver.start()
    // CQ oído en un ciclo par (:00): contestamos en impar.
    operator.answer({
      id: 'x',
      mode: 'FT8',
      slotStartMs: at('12:34:30'),
      snrDb: -9,
      dtS: 0,
      audioHz: 900,
      text: 'CQ F5BZB JN05',
      parsed: { kind: 'cq', toCall: '', fromCall: 'F5BZB', grid: 'JN05' },
    })
    expect(operator.getState().settings.txParity).toBe('odd')
    await vi.advanceTimersByTimeAsync(at('12:36:30') - T0)
    expect(messages(transmitter)).toEqual(['F5BZB EA7LJY IM76', 'F5BZB EA7LJY R-09'])
    expect(operator.getState().qso.phase).toBe('done')
    expect(operator.getState().logDraft?.rstRcvd).toBe('-09')
  })

  it('si llaman dos a la vez atiende a la más fuerte y la otra pasa a la cola', async () => {
    const { receiver, operator } = setup({
      '12:35:30': [
        { db: -12, dt: 0.1, df: 1500, text: 'EA7LJY F5BZB JN05' },
        { db: -3, dt: 0.1, df: 700, text: 'EA7LJY DL1ABC JO62' },
      ],
    })
    await receiver.start()
    operator.callCq()
    await vi.advanceTimersByTimeAsync(at('12:35:45') - T0)
    // Contesta a la más fuerte (DL1ABC, -3 dB) y deja a la otra esperando.
    expect(operator.getState().qso.partner).toBe('DL1ABC')
    expect(operator.getState().waiting).toEqual(['F5BZB'])
  })

  it('Halt TX corta la emisión, suelta el PTT y deshabilita la TX', async () => {
    const { receiver, transmitter, ptt, operator } = setup()
    await receiver.start()
    operator.callCq()
    await vi.advanceTimersByTimeAsync(at('12:35:16') - T0)
    expect(operator.getState().tx.phase).toBe('on-air')
    operator.haltTx()
    expect(ptt.off).toHaveBeenCalled()
    expect(operator.getState()).toMatchObject({ txEnabled: false, tx: { phase: 'idle' } })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(messages(transmitter)).toEqual(['CQ EA7LJY IM76'])
  })

  it('un mensaje suelto sale una vez en el próximo ciclo propio', async () => {
    const { receiver, transmitter, operator } = setup()
    await receiver.start()
    operator.setDx('F5BZB', 'JN05')
    operator.sendStandard('tx5')
    await vi.advanceTimersByTimeAsync(at('12:36:30') - T0)
    expect(messages(transmitter)).toEqual(['F5BZB EA7LJY 73'])
  })

  it('en FT4 transmite en ciclos de 7,5 s', async () => {
    const { receiver, transmitter, operator } = setup()
    receiver.setMode('FT4')
    await receiver.start()
    operator.callCq()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(transmitter.sent.length).toBeGreaterThan(0)
    expect(transmitter.sent[0].request.mode).toBe('FT4')
    expect(transmitter.sent[0].request.startAtMs % 7_500).toBe(500)
  })

  it('el vigilante deja de llamar CQ tras los minutos fijados', async () => {
    const { receiver, operator } = setup()
    operator.updateSettings({ txWatchdogMin: 1 })
    await receiver.start()
    operator.callCq()
    await vi.advanceTimersByTimeAsync(75_000)
    expect(operator.getState().txEnabled).toBe(false)
    expect(operator.getState().notices.at(-1)?.text).toMatch(/Vigilante/)
  })

  it('recupera el QSO en curso tras recargar', async () => {
    const store = memoryStore()
    const first = setup({}, store)
    first.operator.setDx('F5BZB', 'JN05')
    first.operator.callDx()
    first.detach()
    const second = setup({}, store)
    expect(second.operator.getState()).toMatchObject({ restored: true, dxCall: 'F5BZB', qso: { phase: 'call', partner: 'F5BZB' } })
  })
})
