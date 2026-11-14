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
  setLocale: (locale: string) => ipcRenderer.send('app:locale', locale),

  onData: (listener: (chunk: string) => void) => subscribe('radio:data', listener),
  onStatus: (listener: CallableFunction) =>
    subscribe('radio:status', (status) => listener(status)),
  integrations: {
    upload: (request: unknown) => ipcRenderer.invoke('integrations:upload', request),
    test: (request: unknown) => ipcRenderer.invoke('integrations:test', request),
    hasSecret: (service: string) => ipcRenderer.invoke('integrations:secret:has', service),
    setSecret: (service: string, value: string) => ipcRenderer.invoke('integrations:secret:set', { service, value }),
    clearSecret: (service: string) => ipcRenderer.invoke('integrations:secret:clear', service),
    secureStorage: () => ipcRenderer.invoke('integrations:secure'),
    detectTqsl: () => ipcRenderer.invoke('integrations:tqsl:detect'),
    pickTqsl: () => ipcRenderer.invoke('integrations:tqsl:pick'),
  },
  sdr: {
    open: (options: { host: string; port: number }) => ipcRenderer.invoke('sdr:open', options),
    command: (command: number, value: number) => ipcRenderer.invoke('sdr:command', command, value),
    read: (bytes: number) => ipcRenderer.invoke('sdr:read', bytes),
    close: () => ipcRenderer.invoke('sdr:close'),
  },
})
