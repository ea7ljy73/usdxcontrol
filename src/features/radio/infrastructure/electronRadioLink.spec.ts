import { describe, expect, it, vi } from 'vitest'
import { createElectronRadioLink } from './electronRadioLink'
import type { RadioBridgeApi } from '@/types/electron-api'

const createApi = (): RadioBridgeApi => ({
  openPort: vi.fn(async () => ({ path: '/dev/ttyUSB0' })),
  closePort: vi.fn(async () => undefined),
  write: vi.fn(async () => undefined),
  listPorts: vi.fn(async () => [
    { path: '/dev/ttyUSB0', manufacturer: 'Silicon Labs' },
    { path: '/dev/ttyS1' },
  ]),
  onData: () => () => undefined,
  onStatus: () => () => undefined,
})

describe('electronRadioLink', () => {
  it('prolonga la ruta del puerto elegido en open', async () => {
    const api = createApi()
    const link = createElectronRadioLink(api)
    await link.open({ path: '/dev/ttyUSB1' })
    expect(api.openPort).toHaveBeenCalledWith({ path: '/dev/ttyUSB1' })
  })

  it('abre sin opciones si no se elige puerto', async () => {
    const api = createApi()
    const link = createElectronRadioLink(api)
    await link.open()
    expect(api.openPort).toHaveBeenCalledWith(undefined)
  })

  it('lista los puertos con etiqueta legible', async () => {
    const link = createElectronRadioLink(createApi())
    await expect(link.listPorts?.()).resolves.toEqual([
      { path: '/dev/ttyUSB0', label: '/dev/ttyUSB0 · Silicon Labs' },
      { path: '/dev/ttyS1', label: '/dev/ttyS1' },
    ])
  })
})
