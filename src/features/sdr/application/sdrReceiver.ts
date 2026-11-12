import { t } from '@/i18n/i18n'
import type { SpectrumFeed, SpectrumFrame } from '@/features/spectrum/application/ports'
import { iqSpectrumDb } from '../domain/iqSpectrum'
import { DEFAULT_SDR_SAMPLE_RATE, sdrCenterFor, type FreqRange } from '../domain/sdrTuning'
import type { SdrConnectors, SdrDevice, SdrSettings, SdrSource } from './ports'

export type SdrStatus = 'off' | 'connecting' | 'on' | 'muted' | 'error'

export type SdrState = {
  status: SdrStatus
  settings: SdrSettings
  centerHz: number | null
  lastError: string | null
  // Formas de conectar disponibles aquí (USB con WebUSB; rtl_tcp solo en escritorio).
  available: SdrSource[]
}

type Store = { get<T>(key: string): T | null; set(key: string, value: unknown): void }

export const DEFAULT_SDR_SETTINGS: SdrSettings = {
  source: 'usb',
  host: '127.0.0.1',
  port: 1234,
  sampleRate: DEFAULT_SDR_SAMPLE_RATE,
  gainDb: null,
  directSampling: 'q',
  ppm: 0,
  upconverterHz: 0,
  muteOnTx: true,
}

const FFT_SIZE = 4_096
const AVERAGE_BLOCKS = 4
const FRAME_INTERVAL_MS = 40
// Ganancia mínima durante la TX: el uSDX está al lado y satura (o daña) el RTL-SDR.
const TX_GAIN_DB = 0
// Tras volver a RX o cambiar de frecuencia, el primer bloque trae el transitorio.
const SETTLE_BLOCKS = 1

type Options = {
  connectors: SdrConnectors
  store: Store
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const createSdrReceiver = ({ connectors, store, sleep = defaultSleep }: Options) => {
  const available = (Object.keys(connectors) as SdrSource[]).filter((key) => connectors[key])
  const stored = store.get<Partial<SdrSettings>>('sdr.settings') ?? {}
  const settings: SdrSettings = { ...DEFAULT_SDR_SETTINGS, ...stored }
  if (!available.includes(settings.source) && available.length > 0) settings.source = available[0]
  let state: SdrState = { status: 'off', settings, centerHz: null, lastError: null, available }
  let device: SdrDevice | null = null
  let generation = 0
  let frame: SpectrumFrame | null = null
  let wantedHz: number | null = null
  let tunedHz: number | null = null
  let tx = false
  let view: { vfoHz: number; band: FreqRange | null } | null = null
  const listeners = new Set<(state: SdrState) => void>()

  const update = (patch: Partial<SdrState>) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener(state))
  }

  const retarget = () => {
    if (!view) return
    wantedHz = sdrCenterFor({ ...view, currentHz: wantedHz, sampleRate: state.settings.sampleRate })
  }

  const fail = (error: unknown) => {
    generation += 1
    const opened = device
    device = null
    frame = null
    void opened?.close().catch(() => undefined)
    update({ status: 'error', lastError: error instanceof Error ? error.message : String(error), centerHz: null })
  }

  const muted = () => tx && state.settings.muteOnTx

  const loop = async (own: number, opened: SdrDevice) => {
    let settle = 0
    let wasMuted = false
    try {
      while (own === generation) {
        if (muted()) {
          if (!wasMuted) {
            wasMuted = true
            frame = null
            await opened.setGain(TX_GAIN_DB)
            update({ status: 'muted' })
          }
          await sleep(50)
          continue
        }
        if (wasMuted) {
          wasMuted = false
          await opened.setGain(state.settings.gainDb)
          settle = SETTLE_BLOCKS
          update({ status: 'on' })
        }
        if (wantedHz !== null && wantedHz !== tunedHz) {
          tunedHz = wantedHz
          await opened.setCenterHz(tunedHz + state.settings.upconverterHz)
          settle = SETTLE_BLOCKS
          update({ centerHz: tunedHz })
        }
        if (tunedHz === null) {
          await sleep(50)
          continue
        }
        const iq = await opened.read(FFT_SIZE * AVERAGE_BLOCKS)
        if (own !== generation) return
        if (settle > 0) {
          settle -= 1
          continue
        }
        if (muted()) continue
        const rate = state.settings.sampleRate
        frame = { kind: 'rf', startHz: tunedHz - rate / 2, binHz: rate / FFT_SIZE, bins: iqSpectrumDb(iq, FFT_SIZE) }
        await sleep(FRAME_INTERVAL_MS)
      }
    } catch (error) {
      if (own === generation) fail(error)
    }
  }

  const connect = async () => {
    if (state.status === 'connecting' || state.status === 'on' || state.status === 'muted') return
    const connector = connectors[state.settings.source]
    if (!connector) {
      update({ status: 'error', lastError: t('errors.sdr.sourceUnavailable') })

      return
    }
    const own = ++generation
    update({ status: 'connecting', lastError: null })
    try {
      const opened = await connector(state.settings)
      if (own !== generation) {
        await opened.close()
        return
      }
      const { sampleRate, gainDb, directSampling, ppm } = state.settings
      await opened.setSampleRate(sampleRate)
      await opened.setPpm(ppm)
      await opened.setDirectSampling(directSampling)
      await opened.setGain(gainDb)
      device = opened
      tunedHz = null
      retarget()
      update({ status: muted() ? 'muted' : 'on' })
      void loop(own, opened)
    } catch (error) {
      if (own === generation) fail(error)
    }
  }

  const disconnect = async () => {
    generation += 1
    const opened = device
    device = null
    frame = null
    tunedHz = null
    update({ status: 'off', centerHz: null })
    await opened?.close().catch(() => undefined)
  }

  return {
    connect,
    disconnect,
    // El panadaptador muestra este VFO y esta banda: el SDR se centra para cubrirlos.
    follow(vfoHz: number | null, band: FreqRange | null) {
      view = vfoHz === null ? null : { vfoHz, band }
      retarget()
    },
    // PTT del uSDX.
    setTx(on: boolean) {
      tx = on
      if (on && state.settings.muteOnTx) frame = null
    },
    async updateSettings(patch: Partial<SdrSettings>) {
      const next = { ...state.settings, ...patch }
      store.set('sdr.settings', next)
      update({ settings: next })
      const opened = device
      if (!opened) return
      try {
        if (patch.sampleRate !== undefined) {
          await opened.setSampleRate(next.sampleRate)
          retarget()
          tunedHz = null
        }
        if (patch.ppm !== undefined) await opened.setPpm(next.ppm)
        if (patch.directSampling !== undefined) await opened.setDirectSampling(next.directSampling)
        if (patch.gainDb !== undefined && !muted()) await opened.setGain(next.gainDb)
        if (patch.upconverterHz !== undefined) tunedHz = null
      } catch (error) {
        fail(error)
      }
    },
    feed(): SpectrumFeed {
      return { read: () => frame, stop: () => undefined }
    },
    subscribe(listener: (state: SdrState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getState: () => state,
  }
}

export type SdrReceiver = ReturnType<typeof createSdrReceiver>
