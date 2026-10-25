import { ipcMain } from 'electron'
import { SerialPort, type SerialPort as SerialPortInstance } from 'serialport'

type Emit = (channel: string, payload: string) => void
type OpenOptions = { path?: unknown; baudRate?: unknown }

let port: SerialPortInstance | null = null

const closeCurrent = (emit: Emit) =>
  new Promise<void>((resolve) => {
    if (port === null) {
      resolve()
      return
    }
    const current = port
    port = null
    current.close(() => {
      emit('radio:status', 'disconnected')
      resolve()
    })
  })

const isValidPath = (value: unknown): value is string => typeof value === 'string' && value !== ''

export function registerRadioIpc(emit: Emit) {
  ipcMain.handle('radio:list', () => SerialPort.list())

  ipcMain.handle('radio:open', async (_event, options?: OpenOptions): Promise<{ path: string }> => {
    const baudRate =
      typeof options?.baudRate === 'number' && Number.isFinite(options.baudRate) && options.baudRate > 0
        ? options.baudRate
        : 38_400
    if (baudRate > 4_000_000) throw new Error('Baud rate fuera de rango')
    let targetPath: string
    if (isValidPath(options?.path)) {
      targetPath = options.path
    } else {
      const ports = await SerialPort.list()
      targetPath = ports[0]?.path ?? ''
      if (targetPath === '') throw new Error('No hay puertos serie disponibles')
    }
    await closeCurrent(emit)
    const opened = new SerialPort({ path: targetPath, baudRate, autoOpen: false })
    await new Promise<void>((resolve, reject) => {
      opened.open((error) => {
        if (error) reject(new Error(error.message))
        else resolve()
      })
    })
    port = opened
    opened.on('data', (chunk: Buffer) => {
      emit('radio:data', chunk.toString('utf-8'))
    })
    opened.on('close', () => {
      if (port === opened) port = null
      emit('radio:status', 'disconnected')
    })
    emit('radio:status', 'connected')
    return { path: targetPath }
  })

  ipcMain.handle('radio:write', (_event, data: unknown) =>
    new Promise<void>((resolve, reject) => {
      if (typeof data !== 'string') {
        reject(new Error('Payload inválido'))
        return
      }
      if (port === null || !port.isOpen) {
        reject(new Error('Puerto serie cerrado'))
        return
      }
      port.write(data, (error) => {
        if (error) reject(error)
        else resolve()
      })
    }),
  )

  ipcMain.handle('radio:close', async () => {
    await closeCurrent(emit)
  })
}
