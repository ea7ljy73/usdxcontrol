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
  // Cliente rtl_tcp del proceso principal (SDR por red).
  sdr: {
    open(options: { host: string; port: number }): Promise<void>
    command(command: number, value: number): Promise<void>
    read(bytes: number): Promise<Uint8Array>
    close(): Promise<void>
  }
}

declare global {
  interface Window {
    api?: RadioBridgeApi
  }
}
