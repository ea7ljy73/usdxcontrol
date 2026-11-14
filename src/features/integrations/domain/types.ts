import type { LogEntry } from '@/features/digital/domain/logbook'
import type { IntegrationService } from '@/types/integrations'

export type DeliveryMode = 'off' | 'instant' | 'scheduled'

export type ServiceConfig = {
  enabled: boolean
  mode: DeliveryMode
  intervalMinutes: number
  callsign: string
  username: string
  qthNickname: string
  stationLocation: string
  tqslPath: string
}

export type IntegrationsConfig = {
  services: Record<IntegrationService, ServiceConfig>
}

export type DeliveryState = 'pending' | 'sending' | 'sent' | 'duplicate' | 'error' | 'blocked'

export type DeliveryItem = {
  qsoId: string
  service: IntegrationService
  snapshot: LogEntry
  state: DeliveryState
  attempts: number
  nextAttemptAt: number
  lastError: string | null
  updatedAt: number
}

export type LogSyncState = {
  config: IntegrationsConfig
  items: DeliveryItem[]
  sending: Record<IntegrationService, boolean>
  available: boolean
  secureStorage: boolean | null
}

export const DEFAULT_INTEGRATIONS_CONFIG: IntegrationsConfig = {
  services: {
    qrz: {
      enabled: false,
      mode: 'instant',
      intervalMinutes: 5,
      callsign: '',
      username: '',
      qthNickname: '',
      stationLocation: '',
      tqslPath: '',
    },
    clublog: {
      enabled: false,
      mode: 'scheduled',
      intervalMinutes: 5,
      callsign: '',
      username: '',
      qthNickname: '',
      stationLocation: '',
      tqslPath: '',
    },
    lotw: {
      enabled: false,
      mode: 'scheduled',
      intervalMinutes: 5,
      callsign: '',
      username: '',
      qthNickname: '',
      stationLocation: '',
      tqslPath: '',
    },
    eqsl: {
      enabled: false,
      mode: 'instant',
      intervalMinutes: 5,
      callsign: '',
      username: '',
      qthNickname: '',
      stationLocation: '',
      tqslPath: '',
    },
  },
}

export const SERVICE_NAMES: Record<IntegrationService, string> = {
  qrz: 'QRZ',
  clublog: 'ClubLog',
  lotw: 'LoTW',
  eqsl: 'eQSL',
}

export const SCHEDULE_INTERVALS = [5, 10, 15, 30, 60] as const