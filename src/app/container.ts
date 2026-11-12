import { createContext, useContext } from 'react'
import { getLocale, subscribeLocale, t } from '@/i18n/i18n'
import { createRadioSession } from '@/features/radio/application/radioSession'
import { audioViewFor } from '@/features/radio/domain/passband'
import type { SerialPortChoice } from '@/features/radio/application/ports'
import { createCatSimulatorLink } from '@/features/radio/infrastructure/catSimulatorRadioLink'
import { createElectronRadioLink } from '@/features/radio/infrastructure/electronRadioLink'
import { createWebSerialRadioLink } from '@/features/radio/infrastructure/webSerialRadioLink'
import { createDigiClock, type DigiClock } from '@/features/digital/application/digiClock'
import { createDigiReceiver, type DigiReceiver } from '@/features/digital/application/digiReceiver'
import { createFt8Operator, type Ft8Operator } from '@/features/digital/application/ft8Operator'
import type { AudioDeviceList, DigiTransmitter, KeyValueStore, LogFiles, PskReporterSource, UtcSource } from '@/features/digital/application/ports'
import { downloadAdif, readAdifFile } from '@/features/digital/infrastructure/adifFile'
import { encodeFt8 } from '@/features/digital/infrastructure/ft8Encoder'
import { createSdrReceiver, type SdrReceiver } from '@/features/sdr/application/sdrReceiver'
import { rtlTcpBridge } from '@/features/sdr/infrastructure/rtlTcpBridge'
import { simulatedSdr } from '@/features/sdr/infrastructure/simulatedSdr'
import { webUsbRtlSdr } from '@/features/sdr/infrastructure/webUsbRtlSdr'
import { httpUtcSource } from '@/features/digital/infrastructure/httpUtcSource'
import { localLogbook, localStore } from '@/features/digital/infrastructure/localStore'
import { mediaDeviceList } from '@/features/digital/infrastructure/mediaDevices'
import { createPskReporterJsonp } from '@/features/digital/infrastructure/pskReporterJsonp'
import type { SimulatedBand } from '@/features/digital/infrastructure/sim/simulatedBand'
import { createSimulatedTransmitter } from '@/features/digital/infrastructure/sim/simulatedTransmitter'
import { createWasmDigiDecoder } from '@/features/digital/infrastructure/wasmDigiDecoder'
import { openWebAudioInput } from '@/features/digital/infrastructure/webAudioInput'
import { createWebAudioTransmitter } from '@/features/digital/infrastructure/webAudioTransmitter'
import type { SpectrumFeedFactory } from '@/features/spectrum/application/ports'
import { startAudioCapture } from '@/features/spectrum/infrastructure/audioCapture'

export type PortSelection = { list(): Promise<SerialPortChoice[]> }

// audio: audio demodulado de la radio (tarjeta de sonido o simulador).
// rf: espectro de un SDR en otro puerto; null hasta que exista un adaptador.
export type SpectrumFeeds = { audio: SpectrumFeedFactory; rf: SpectrumFeedFactory | null }

export type LinkKind = 'mock' | 'electron' | 'webserial'

type Container = {
  session: ReturnType<typeof createRadioSession>
  linkKind: LinkKind
  portSelection: PortSelection | null
  spectrumSimulated: boolean
  spectrumFeeds: SpectrumFeeds
  digital: Digital
  sdr: SdrReceiver
}

// FT8/FT4: receptor, operador del QSO y lo que necesita la pantalla (hora y tarjetas).
export type Digital = {
  clock: DigiClock
  receiver: DigiReceiver
  operator: Ft8Operator
  transmitter: DigiTransmitter
  utcSource: UtcSource
  devices: AudioDeviceList
  store: KeyValueStore
  logFiles: LogFiles
  pskReporter: PskReporterSource
}

const hasLocation = typeof window !== 'undefined' && typeof window.location !== 'undefined'

const forceMock =
  hasLocation && new URLSearchParams(window.location.search).get('radio') === 'mock'

const bridgeApi = typeof window !== 'undefined' ? window.api : undefined
const hasWebSerial =
  typeof navigator !== 'undefined' &&
  (navigator as Navigator & { serial?: unknown }).serial !== undefined

// ?radio=mock fuerza la simulación también en Electron (demostración y pruebas).
const useMock = forceMock || (!bridgeApi && !hasWebSerial)
const link = useMock
  ? createCatSimulatorLink()
  : bridgeApi
    ? createElectronRadioLink(bridgeApi)
    : createWebSerialRadioLink()

const listPorts = link.listPorts
const portSelection: PortSelection | null =
  listPorts ? { list: () => listPorts() } : null

const session = createRadioSession(link)

// El simulador de audio "escucha" donde esté sintonizada la radio simulada.
const simulatedTuning = () => {
  const { frequency, mode } = session.getSnapshot()
  return frequency === null || mode === null ? null : { dialHz: frequency, view: audioViewFor(mode) }
}

// En simulación, una banda con una grabación real de FT8 y estaciones que contestan.
let simulatedBand: Promise<SimulatedBand> | null = null
const loadSimulatedBand = () =>
  (simulatedBand ??= import('@/features/digital/infrastructure/sim/simulatedBand').then((m) => m.createSimulatedBand(encodeFt8)))

const digiClock = createDigiClock()
const digiReceiver = createDigiReceiver({
  decoder: createWasmDigiDecoder(),
  clock: digiClock,
  input: useMock
    ? async ({ gain }) => {
        const [band, { openSimulatedAudioInput }] = await Promise.all([
          loadSimulatedBand(),
          import('@/features/digital/infrastructure/sim/simulatedAudioInput'),
        ])
        return openSimulatedAudioInput(band, gain)
      }
    : openWebAudioInput,
})
const digiTransmitter = useMock ? createSimulatedTransmitter(loadSimulatedBand) : createWebAudioTransmitter(encodeFt8)

const digital: Digital = {
  clock: digiClock,
  receiver: digiReceiver,
  transmitter: digiTransmitter,
  operator: createFt8Operator({
    receiver: digiReceiver,
    transmitter: digiTransmitter,
    ptt: { on: () => session.pttOn(), off: () => session.pttOff() },
    clock: digiClock,
    store: localStore,
    logbook: localLogbook,
    dialHz: () => session.getSnapshot().frequency,
    canTransmit: () => session.getSnapshot().linkStatus === 'connected',
  }),
  utcSource: useMock ? { fetchUtcMs: async () => Date.now() } : httpUtcSource,
  devices: useMock
    ? {
        list: async () => ({
          inputs: [{ id: 'sim-in', label: t('audio.simInput') }],
          outputs: [{ id: 'sim-out', label: t('audio.simOutput') }],
        }),
      }
    : mediaDeviceList,
  store: localStore,
  logFiles: { exportAdif: downloadAdif, importAdif: readAdifFile },
  // En simulación no se consulta el servicio real: dos escuchas de ejemplo.
  pskReporter: useMock
    ? {
        spotsFor: async () => [
          { receiver: 'EA3SIM', locator: 'JN11CK', country: 'Spain', frequencyHz: 14_075_500, snrDb: -8, timeMs: Date.now() - 60_000, mode: 'FT8' },
          { receiver: 'F4SIM', locator: 'JN03', country: 'France', frequencyHz: 14_075_480, snrDb: -15, timeMs: Date.now() - 180_000, mode: 'FT8' },
        ],
      }
    : createPskReporterJsonp(),
}

// El operador vigila los ciclos desde el arranque (solo transmite si se le pide).
digital.operator.start()

// SDR para el panadaptador: RTL-SDR por USB directo (WebUSB) o por red (rtl_tcp, solo en
// escritorio). En simulación, un SDR que genera IQ con señales de 40 y 20 m.
const hasWebUsb = typeof navigator !== 'undefined' && 'usb' in navigator
const sdr = createSdrReceiver({
  connectors: useMock
    ? { usb: simulatedSdr }
    : { usb: hasWebUsb ? webUsbRtlSdr : undefined, tcp: bridgeApi ? rtlTcpBridge(bridgeApi.sdr) : undefined },
  store: localStore,
})
// El SDR deja de recibir mientras el uSDX transmite.
session.subscribe((snapshot) => sdr.setTx(snapshot.tx))

const container: Container = {
  session,
  linkKind: useMock ? 'mock' : bridgeApi ? 'electron' : 'webserial',

  portSelection,
  spectrumSimulated: useMock,
  spectrumFeeds: {
    audio: useMock
      ? () => import('@/features/spectrum/infrastructure/spectrumSimulator').then((m) => m.startSimulatedAudioFeed(simulatedTuning))
      : startAudioCapture,
    rf: null,
  },
  digital,
  sdr,
}

export { container, type Container }

export const ContainerContext = createContext<Container | null>(null)

export const useContainer = (): Container => {
  const value = useContext(ContainerContext)
  if (value === null) throw new Error('useContainer requiere ContainerProvider')
  return value
}

// En escritorio, los errores del proceso principal (puerto serie, rtl_tcp) salen en el idioma de la interfaz.
if (bridgeApi?.setLocale) {
  const sync = () => bridgeApi.setLocale?.(getLocale())
  sync()
  subscribeLocale(sync)
}
