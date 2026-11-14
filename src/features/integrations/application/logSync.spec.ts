import { describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '@/features/digital/domain/logbook'
import type { IntegrationUploadRequest, IntegrationUploadResult } from '@/types/integrations'
import { createLogSync } from './logSync'
import type { IntegrationsBridge, KeyValueStore } from './ports'
import { DEFAULT_INTEGRATIONS_CONFIG, type IntegrationsConfig } from '../domain/types'

const memoryStore = (): KeyValueStore => {
  const values = new Map<string, unknown>()
  return {
    get: <T,>(key: string) => (values.has(key) ? (values.get(key) as T) : null),
    set: (key, value) => void values.set(key, value),
  }
}

const entry = (call: string, endedAt: string): LogEntry => ({
  id: `${endedAt}-${call}`,
  myCall: 'EA7LJY',
  myGrid: 'IM76HK',
  call,
  grid: 'FN20',
  dialHz: 14_074_000,
  toneHz: 1_000,
  mode: 'FT8',
  rstSent: '-10',
  rstRcvd: '-08',
  startedAt: endedAt.replace(/:00\.000Z$/, ':00.000Z'),
  endedAt,
  notes: '',
})

const bridgeWith = (result: IntegrationUploadResult = { ok: true }) => {
  const upload = vi.fn(async (_request: IntegrationUploadRequest) => result)
  const bridge: IntegrationsBridge = {
    available: true,
    upload,
    test: vi.fn(async () => ({ ok: true })),
    hasSecret: vi.fn(async () => true),
    setSecret: vi.fn(async () => undefined),
    clearSecret: vi.fn(async () => undefined),
    secureStorage: vi.fn(async () => ({ available: true })),
    detectTqsl: vi.fn(async () => '/usr/bin/tqsl'),
    pickTqsl: vi.fn(async () => null),
  }
  return { bridge, upload }
}

const config = (overrides: Partial<IntegrationsConfig['services']> = {}): IntegrationsConfig => ({
  services: {
    ...DEFAULT_INTEGRATIONS_CONFIG.services,
    ...overrides,
  },
})

describe('cola de envío online', () => {
  it('encola solo los servicios activos y persistente la cola', async () => {
    const store = memoryStore()
    const { bridge } = bridgeWith()
    const sync = createLogSync({ bridge, store, autoStart: false })
    sync.updateConfig(config({ qrz: { ...DEFAULT_INTEGRATIONS_CONFIG.services.qrz, enabled: true, mode: 'instant' } }))

    sync.enqueue(entry('K1JT', '2026-08-25T13:15:00.000Z'))

    expect(sync.getState().items).toHaveLength(1)
    expect(sync.getState().items[0]).toMatchObject({ service: 'qrz', state: 'pending' })
    expect(store.get('integrations.outbox')).toHaveLength(1)
    await sync.flushService('qrz')
    expect(sync.getState().items[0].state).toBe('sent')
  })

  it('QRZ va QSO a QSO y ClubLog agrupa en un solo ADIF', async () => {
    const { bridge, upload } = bridgeWith()
    const sync = createLogSync({ bridge, store: memoryStore(), autoStart: false })
    sync.updateConfig(
      config({
        qrz: { ...DEFAULT_INTEGRATIONS_CONFIG.services.qrz, enabled: true, mode: 'instant' },
        clublog: { ...DEFAULT_INTEGRATIONS_CONFIG.services.clublog, enabled: true, mode: 'instant', callsign: 'EA7LJY' },
      }),
    )
    sync.enqueue(entry('K1JT', '2026-08-25T13:15:00.000Z'))
    sync.enqueue(entry('F5BZB', '2026-08-25T13:16:00.000Z'))

    await sync.flushService('qrz')
    await sync.flushService('clublog')

    const qrzCalls = upload.mock.calls.filter(([request]) => request.service === 'qrz')
    const clublogCalls = upload.mock.calls.filter(([request]) => request.service === 'clublog')
    expect(qrzCalls).toHaveLength(2)
    expect(qrzCalls[0][0].adif).toContain('<CALL:4>K1JT')
    expect(clublogCalls).toHaveLength(1)
    expect(clublogCalls[0][0].adif.match(/<EOR>/g)).toHaveLength(2)
  })

  it('respeta el modo programado hasta que toca o se fuerza', async () => {
    const { bridge, upload } = bridgeWith()
    const sync = createLogSync({ bridge, store: memoryStore(), autoStart: false })
    sync.updateConfig(
      config({
        lotw: { ...DEFAULT_INTEGRATIONS_CONFIG.services.lotw, enabled: true, mode: 'scheduled', intervalMinutes: 5, stationLocation: 'Casa' },
      }),
    )
    sync.enqueue(entry('K1JT', '2026-08-25T13:15:00.000Z'))

    await sync.flushService('lotw')
    expect(upload).not.toHaveBeenCalled()

    await sync.flushService('lotw', true)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(sync.getState().items[0].state).toBe('sent')
  })

  it('marca los fallos permanentes como bloqueados y los rearma al corregir la configuración', async () => {
    const { bridge, upload } = bridgeWith({ ok: false, permanent: true, message: 'token inválido' })
    const sync = createLogSync({ bridge, store: memoryStore(), autoStart: false })
    sync.updateConfig(
      config({
        clublog: { ...DEFAULT_INTEGRATIONS_CONFIG.services.clublog, enabled: true, mode: 'instant', callsign: 'EA7LJY' },
      }),
    )
    sync.enqueue(entry('K1JT', '2026-08-25T13:15:00.000Z'))
    await sync.flushService('clublog')

    expect(sync.getState().items[0]).toMatchObject({ state: 'blocked', lastError: 'token inválido' })

    await sync.flushService('clublog')
    expect(upload).toHaveBeenCalledTimes(1)
    await sync.flushService('clublog', true)
    expect(upload).toHaveBeenCalledTimes(2)

    sync.updateConfig(
      config({
        clublog: { ...DEFAULT_INTEGRATIONS_CONFIG.services.clublog, enabled: true, mode: 'instant', callsign: 'EA7LJY2' },
      }),
    )
    expect(sync.getState().items[0]).toMatchObject({ state: 'pending', lastError: null })
  })
})