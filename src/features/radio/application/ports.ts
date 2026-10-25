export type RadioLinkStatus = 'disconnected' | 'connecting' | 'connected'

export type SerialPortChoice = { path: string; label: string }

export interface RadioLink {
  open(options?: { path?: string }): Promise<void>
  close(): Promise<void>
  send(data: string): void
  onData(listener: (chunk: string) => void): () => void
  onStatusChange(listener: (status: RadioLinkStatus) => void): () => void
  listPorts?(): Promise<SerialPortChoice[]>
}
