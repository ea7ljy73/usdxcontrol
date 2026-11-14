export const INTEGRATION_SERVICES = ['qrz', 'clublog', 'lotw', 'eqsl'] as const

export type IntegrationService = (typeof INTEGRATION_SERVICES)[number]

export type IntegrationRequestConfig = {
  callsign?: string
  username?: string
  qthNickname?: string
  stationLocation?: string
  tqslPath?: string
}

export type IntegrationUploadRequest = {
  service: IntegrationService
  adif: string
  config: IntegrationRequestConfig
}

export type IntegrationUploadResult = {
  ok: boolean
  duplicate?: boolean
  permanent?: boolean
  message?: string
  retryAfterMs?: number
}

export type SecureStorageInfo = {
  available: boolean
}