import type {
  IntegrationService,
  IntegrationUploadRequest,
  IntegrationUploadResult,
  SecureStorageInfo,
} from '@/types/integrations'

export type IntegrationsBridge = {
  available: boolean
  upload(request: IntegrationUploadRequest): Promise<IntegrationUploadResult>
  test(request: IntegrationUploadRequest): Promise<IntegrationUploadResult>
  hasSecret(service: IntegrationService): Promise<boolean>
  setSecret(service: IntegrationService, value: string): Promise<void>
  clearSecret(service: IntegrationService): Promise<void>
  secureStorage(): Promise<SecureStorageInfo>
  detectTqsl(): Promise<string | null>
  pickTqsl(): Promise<string | null>
}

export type KeyValueStore = {
  get<T>(key: string): T | null
  set(key: string, value: unknown): void
}