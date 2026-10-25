import { createContext, useContext } from 'react'
import { createRadioSession } from '@/features/radio/application/radioSession'
import type { SerialPortChoice } from '@/features/radio/application/ports'
import { createCatSimulatorLink } from '@/features/radio/infrastructure/catSimulatorRadioLink'
import { createElectronRadioLink } from '@/features/radio/infrastructure/electronRadioLink'
import { createWebSerialRadioLink } from '@/features/radio/infrastructure/webSerialRadioLink'

export type PortSelection = { list(): Promise<SerialPortChoice[]> }

type Container = {
  session: ReturnType<typeof createRadioSession>
  linkKind: string
  portSelection: PortSelection | null
  spectrumSimulated: boolean
}

const hasLocation = typeof window !== 'undefined' && typeof window.location !== 'undefined'

const forceMock =
  hasLocation && new URLSearchParams(window.location.search).get('radio') === 'mock'

const bridgeApi = typeof window !== 'undefined' ? window.api : undefined
const hasWebSerial =
  typeof navigator !== 'undefined' &&
  (navigator as Navigator & { serial?: unknown }).serial !== undefined

const useMock = !bridgeApi && (forceMock || !hasWebSerial)
const link = useMock
  ? createCatSimulatorLink()
  : bridgeApi
    ? createElectronRadioLink(bridgeApi)
    : createWebSerialRadioLink()

const listPorts = link.listPorts
const portSelection: PortSelection | null =
  listPorts ? { list: () => listPorts() } : null

const container: Container = {
  session: createRadioSession(link, { extended: useMock }),
  linkKind: useMock ? 'CAT simulado' : bridgeApi ? 'Electron · serialport' : 'WebSerial',
  portSelection,
  spectrumSimulated: useMock,
}

export { container, type Container }

export const ContainerContext = createContext<Container | null>(null)

export const useContainer = (): Container => {
  const value = useContext(ContainerContext)
  if (value === null) throw new Error('useContainer requiere ContainerProvider')
  return value
}
