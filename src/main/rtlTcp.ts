import { ipcMain } from 'electron'
import net from 'node:net'

// Cliente rtl_tcp en el proceso principal. Se guarda solo lo último recibido: el
// panadaptador pide bloques a su ritmo y lo que no pide se descarta.
const HEADER_BYTES = 12
const KEEP_BYTES = 1 << 18
const READ_TIMEOUT_MS = 3_000
const MAX_READ_BYTES = 1 << 17
const COMMANDS = new Set([0x01, 0x02, 0x03, 0x04, 0x05, 0x08, 0x09])
const HOST_RE = /^[a-zA-Z0-9.-]{1,253}$|^\[?[0-9a-fA-F:]{2,39}\]?$/

let socket: net.Socket | null = null
let buffer = Buffer.alloc(0)
let headerLeft = HEADER_BYTES
let received = 0
let waiter: { bytes: number; resolve: () => void; reject: (error: Error) => void } | null = null

const reset = () => {
  buffer = Buffer.alloc(0)
  headerLeft = HEADER_BYTES
  received = 0
  waiter = null
}

const closeSocket = (reason = 'rtl_tcp desconectado') => {
  socket?.destroy()
  socket = null
  // Una lectura en curso falla ya, sin esperar al plazo.
  waiter?.reject(new Error(reason))
  reset()
}

export function registerRtlTcpIpc() {
  ipcMain.handle('sdr:open', async (_event, options: { host?: unknown; port?: unknown }) => {
    const host = typeof options?.host === 'string' ? options.host.trim() : ''
    const port = Number(options?.port)
    if (!HOST_RE.test(host)) throw new Error('Host de rtl_tcp no válido')
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Puerto de rtl_tcp no válido')
    closeSocket()
    await new Promise<void>((resolve, reject) => {
      const opened = net.connect({ host, port })
      opened.setNoDelay(true)
      opened.once('connect', () => {
        socket = opened
        resolve()
      })
      // Siempre con oyente: un 'error' sin él tumbaría el proceso principal.
      opened.on('error', (error) => {
        if (socket === opened) closeSocket(`rtl_tcp ${host}:${port}: ${error.message}`)
        else reject(new Error(`rtl_tcp ${host}:${port}: ${error.message}`))
      })
      opened.on('data', (chunk: Buffer) => {
        let data = chunk
        if (headerLeft > 0) {
          const skip = Math.min(headerLeft, data.length)
          headerLeft -= skip
          data = data.subarray(skip)
        }
        if (data.length === 0) return
        received += data.length
        buffer = Buffer.concat([buffer, data])
        if (buffer.length > KEEP_BYTES) buffer = buffer.subarray(buffer.length - KEEP_BYTES)
        if (waiter && buffer.length >= waiter.bytes) waiter.resolve()
      })
      opened.on('close', () => {
        if (socket === opened) closeSocket('rtl_tcp cerró la conexión')
      })
    })
  })

  ipcMain.handle('sdr:command', (_event, command: unknown, value: unknown) => {
    if (!socket) throw new Error('rtl_tcp no conectado')
    if (typeof command !== 'number' || !COMMANDS.has(command)) throw new Error('Orden rtl_tcp no válida')
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new Error('Valor no válido')
    const frame = Buffer.alloc(5)
    frame.writeUInt8(command, 0)
    frame.writeUInt32BE(value, 1)
    socket.write(frame)
  })

  ipcMain.handle('sdr:read', async (_event, bytes: unknown) => {
    if (!socket) throw new Error('rtl_tcp no conectado')
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 2 || bytes > MAX_READ_BYTES) throw new Error('Lectura no válida')
    // Se espera a tener datos nuevos para no repetir el mismo bloque.
    buffer = Buffer.alloc(0)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiter = null
        reject(new Error('rtl_tcp no envía muestras'))
      }, READ_TIMEOUT_MS)
      // Un byte de más para poder alinear el bloque a pares I/Q.
      waiter = {
        bytes: bytes + 1,
        resolve: () => {
          clearTimeout(timer)
          waiter = null
          resolve()
        },
        reject: (error) => {
          clearTimeout(timer)
          waiter = null
          reject(error)
        },
      }
    })
    // Lo último recibido, empezando en una I (posición par desde el principio del flujo).
    const bufferStart = received - buffer.length
    let start = buffer.length - bytes
    if ((bufferStart + start) % 2 !== 0) start -= 1
    return new Uint8Array(buffer.subarray(start, start + bytes))
  })

  ipcMain.handle('sdr:close', () => closeSocket())
}
