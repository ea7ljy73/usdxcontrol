export {}

export interface PortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
}

export interface RadioBridgeApi {
  openPort(options?: { path?: string; baudRate?: number }): Promise<{ path: string }>
  closePort(): Promise<void>
  write(data: string): Promise<void>
  listPorts(): Promise<PortInfo[]>
  onData(listener: (chunk: string) => void): () => void
  onStatus(listener: (status: 'connected' | 'disconnected') => void): () => void
}

declare global {
  interface Window {
    api?: RadioBridgeApi
  }
}
