import type {
  IntegrationService,
  IntegrationUploadRequest,
  IntegrationUploadResult,
  SecureStorageInfo,
} from './integrations'

export {}

export interface PortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
}

export interface IntegrationsBridgeApi {
  upload(request: IntegrationUploadRequest): Promise<IntegrationUploadResult>
  test(request: IntegrationUploadRequest): Promise<IntegrationUploadResult>
  hasSecret(service: IntegrationService): Promise<boolean>
  setSecret(service: IntegrationService, value: string): Promise<void>
  clearSecret(service: IntegrationService): Promise<void>
  secureStorage(): Promise<SecureStorageInfo>
  detectTqsl(): Promise<string | null>
  pickTqsl(): Promise<string | null>
}

export interface RadioBridgeApi {
  openPort(options?: { path?: string; baudRate?: number }): Promise<{ path: string }>
  closePort(): Promise<void>
  write(data: string): Promise<void>
  listPorts(): Promise<PortInfo[]>
  onData(listener: (chunk: string) => void): () => void
  onStatus(listener: (status: 'connected' | 'disconnected') => void): () => void
  // Idioma de la interfaz, para los mensajes de error del proceso principal.
  setLocale?(locale: string): void

  // Cliente rtl_tcp del proceso principal (SDR por red).
  sdr: {
    open(options: { host: string; port: number }): Promise<void>
    command(command: number, value: number): Promise<void>
    read(bytes: number): Promise<Uint8Array>
    close(): Promise<void>
  }

  integrations?: IntegrationsBridgeApi
}

declare global {
  interface Window {
    api?: RadioBridgeApi
  }
}
