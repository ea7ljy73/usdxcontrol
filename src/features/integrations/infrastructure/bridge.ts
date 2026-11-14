import type { IntegrationService, IntegrationUploadRequest, IntegrationUploadResult } from '@/types/integrations'
import type { IntegrationsBridge } from '../application/ports'

const api = typeof window !== 'undefined' ? window.api?.integrations : undefined

const unavailable = (): IntegrationUploadResult => ({
  ok: false,
  permanent: true,
  message: 'Las subidas online solo están disponibles en la app de escritorio',
})

const call = async (
  action: (request: IntegrationUploadRequest) => Promise<IntegrationUploadResult>,
  request: IntegrationUploadRequest,
): Promise<IntegrationUploadResult> => {
  if (!api) return unavailable()
  try {
    return await action(request)
  } catch (cause) {
    return { ok: false, permanent: false, message: cause instanceof Error ? cause.message : String(cause) }
  }
}

export const integrationsBridge: IntegrationsBridge = {
  available: api !== undefined,
  upload: (request) => call((next) => api!.upload(next), request),
  test: (request) => call((next) => api!.test(next), request),
  hasSecret: async (service: IntegrationService) => {
    if (!api) return false
    try {
      return await api.hasSecret(service)
    } catch {
      return false
    }
  },
  setSecret: async (service: IntegrationService, value: string) => {
    if (!api) throw new Error('Las subidas online solo están disponibles en la app de escritorio')
    await api.setSecret(service, value)
  },
  clearSecret: async (service: IntegrationService) => {
    if (!api) return
    await api.clearSecret(service)
  },
  secureStorage: async () => {
    if (!api) return { available: false }
    try {
      return await api.secureStorage()
    } catch {
      return { available: false }
    }
  },
  detectTqsl: async () => {
    if (!api) return null
    try {
      return await api.detectTqsl()
    } catch {
      return null
    }
  },
  pickTqsl: async () => {
    if (!api) return null
    try {
      return await api.pickTqsl()
    } catch {
      return null
    }
  },
}