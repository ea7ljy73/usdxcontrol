import type { RadioLink, RadioLinkStatus } from '@/features/radio/application/ports'

type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}

type SerialApi = { requestPort(): Promise<SerialPortLike> }

type SerialNavigator = Navigator & { serial?: SerialApi }

export const BAUD_RATE = 38_400

export const createWebSerialRadioLink = (): RadioLink => {
  const serial = (navigator as SerialNavigator).serial
  let port: SerialPortLike | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let reading = false
  let status: RadioLinkStatus = 'disconnected'
  const dataListeners = new Set<(chunk: string) => void>()
  const statusListeners = new Set<(next: RadioLinkStatus) => void>()

  const emitStatus = (next: RadioLinkStatus) => {
    if (status === next) return
    status = next
    statusListeners.forEach((listener) => listener(status))
  }

  const readLoop = async () => {
    if (!port?.readable) return
    const reader = port.readable.getReader()
    const decoder = new TextDecoder()
    try {
      while (reading) {
        const { value, done } = await reader.read()
        if (done) break
        if (value && value.length > 0) {
          const chunk = decoder.decode(value, { stream: true })
          if (chunk !== '') dataListeners.forEach((listener) => listener(chunk))
        }
      }
    } catch {
      reading = false
    } finally {
      reader.releaseLock()
    }
    if (reading) return
    if (port === null) emitStatus('disconnected')
  }

  const open = async () => {
    if (status !== 'disconnected') return
    if (!serial) throw new Error('WebSerial no está disponible en este navegador')
    const chosen = await serial.requestPort()
    await chosen.open({ baudRate: BAUD_RATE })
    writer = chosen.writable.getWriter()
    port = chosen
    reading = true
    emitStatus('connected')
    void readLoop()
  }

  const close = async () => {
    reading = false
    if (writer) {
      try {
        writer.releaseLock()
      } catch {
        writer = null
      }
      writer = null
    }
    try {
      await port?.close()
    } catch {
      port = null
    }
    port = null
    emitStatus('disconnected')
  }

  const send = (data: string) => {
    if (!writer) return
    const bytes = new TextEncoder().encode(data)
    void writer.write(bytes).catch(() => undefined)
  }

  return {
    open,
    close,
    send,
    onData(listener: (chunk: string) => void) {
      dataListeners.add(listener)
      return () => dataListeners.delete(listener)
    },
    onStatusChange(listener: (next: RadioLinkStatus) => void) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
  }
}
