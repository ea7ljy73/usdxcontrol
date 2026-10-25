import type { RadioLink, RadioLinkStatus } from '@/features/radio/application/ports'
import type { RadioBridgeApi } from '@/types/electron-api'

export const createElectronRadioLink = (api: RadioBridgeApi): RadioLink => {
  let status: RadioLinkStatus = 'disconnected'
  const dataListeners = new Set<(chunk: string) => void>()
  const statusListeners = new Set<(next: RadioLinkStatus) => void>()

  api.onData((chunk) => {
    if (chunk === '') return
    dataListeners.forEach((listener) => listener(chunk))
  })
  api.onStatus((next) => {
    if (status === next) return
    status = next
    statusListeners.forEach((listener) => listener(status))
  })

  return {
    open: async (options) => {
      if (status !== 'disconnected') return
      await api.openPort(options)
    },
    close: async () => {
      await api.closePort()
    },
    send: (data: string) => {
      if (data === '') return
      void api.write(data).catch(() => undefined)
    },
    listPorts: async () => {
      const ports = await api.listPorts()
      return ports.map((port) => ({
        path: port.path,
        label: port.manufacturer ? `${port.path} · ${port.manufacturer}` : port.path,
      }))
    },
    onData(listener: (chunk: string) => void) {
      dataListeners.add(listener)
      return () => dataListeners.delete(listener)
    },
    onStatusChange(listener: (next: RadioLinkStatus) => void) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
  }
}
