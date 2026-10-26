import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const subscribe = (channel: string, listener: (payload: string) => void) => {
  const handler = (_event: IpcRendererEvent, payload: string) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  openPort: (options?: { path?: string; baudRate?: number }) => ipcRenderer.invoke('radio:open', options),
  closePort: () => ipcRenderer.invoke('radio:close'),
  write: (data: string) => ipcRenderer.invoke('radio:write', data),
  listPorts: () => ipcRenderer.invoke('radio:list'),
  onData: (listener: (chunk: string) => void) => subscribe('radio:data', listener),
  onStatus: (listener: CallableFunction) =>
    subscribe('radio:status', (status) => listener(status)),
  sdr: {
    open: (options: { host: string; port: number }) => ipcRenderer.invoke('sdr:open', options),
    command: (command: number, value: number) => ipcRenderer.invoke('sdr:command', command, value),
    read: (bytes: number) => ipcRenderer.invoke('sdr:read', bytes),
    close: () => ipcRenderer.invoke('sdr:close'),
  },
})
