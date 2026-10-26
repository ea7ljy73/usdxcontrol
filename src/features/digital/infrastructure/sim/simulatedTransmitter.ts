import type { DigiTransmitter, TxHandle } from '../../application/ports'
import { isEncodableMessage } from '../../domain/messages'
import type { SimulatedBand } from './simulatedBand'

const TX_DURATION_MS = 12_640

// Transmisor del modo sin radio: no suena, pero lleva el tiempo de una emisión real
// y la banda simulada "oye" el mensaje para contestar.
export const createSimulatedTransmitter = (loadBand: () => Promise<SimulatedBand>): DigiTransmitter => {
  let onAir = false
  return {
    async transmit({ message, startAtMs }): Promise<TxHandle> {
      if (!isEncodableMessage(message)) throw new Error('mensaje no válido para FT8')
      const band = await loadBand()
      const timers: ReturnType<typeof setTimeout>[] = []
      let finish: () => void = () => undefined
      const ended = new Promise<void>((resolve) => {
        finish = resolve
      })
      const started = new Promise<void>((resolve) => {
        timers.push(
          setTimeout(() => {
            onAir = true
            void band.hear(message, startAtMs)
            resolve()
            timers.push(
              setTimeout(() => {
                onAir = false
                finish()
              }, TX_DURATION_MS),
            )
          }, Math.max(0, startAtMs - Date.now())),
        )
      })
      return {
        started,
        ended,
        cancel() {
          timers.forEach(clearTimeout)
          onAir = false
          finish()
        },
      }
    },
    levelDb: () => (onAir ? -12 : -120),
    prepare: () => undefined,
    tune: async () => ({ stop: () => undefined }),
    outputLatencyMs: () => 0,
    setOutput: () => undefined,
    setGain: () => undefined,
  }
}
