import { partnerReply, type PartnerConfig, type PartnerState } from '../../domain/ft8partner'
import { parseFt8 } from '../../domain/ft8msg'
import sampleUrl from './sample_ft8.wav?url'
import type { Ft8Encode } from '../ft8Encoder'

const RATE = 12_000
const SLOT_MS = 15_000
// Tono y nivel de las estaciones simuladas que nos contestan (hueco libre en la grabación).
const PARTNER_TONE_HZ = 1_800
const PARTNER_GAIN = 0.05
// Quien contesta a nuestro CQ en la simulación.
const CQ_PARTNER: PartnerConfig = { call: 'EA3SIM', grid: 'JN11', snrDb: -8 }

type Injection = { startMs: number; samples: Float32Array }

const parseWav = (buffer: ArrayBuffer): Float32Array => {
  const view = new DataView(buffer)
  let offset = 12
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(...new Uint8Array(buffer, offset, 4))
    const size = view.getUint32(offset + 4, true)
    if (id === 'data') {
      const pcm = new Int16Array(buffer, offset + 8, Math.floor(size / 2))
      return Float32Array.from(pcm, (value) => value / 32_768)
    }
    offset += 8 + size
  }
  throw new Error('WAV sin datos')
}

// Banda simulada: una grabación real de un ciclo FT8 que se repite alineada con los
// ciclos UTC, más las estaciones virtuales que contestan a lo que transmitimos
// (con el protocolo estándar, ft8partner), codificadas en FT8 de verdad.
export const createSimulatedBand = async (encode: Ft8Encode) => {
  const response = await fetch(sampleUrl)
  const recording = parseWav(await response.arrayBuffer())
  const injections: Injection[] = []
  const partners = new Map<string, { config: PartnerConfig; state: PartnerState }>()

  const partnerFor = (message: string) => {
    const parsed = parseFt8(message)
    if (!parsed) return null
    const call = parsed.kind === 'cq' ? CQ_PARTNER.call : parsed.toCall
    if (!call) return null
    if (!partners.has(call)) {
      partners.set(call, { config: call === CQ_PARTNER.call ? CQ_PARTNER : { call, grid: 'JN00', snrDb: -10 }, state: 'idle' })
    }
    return partners.get(call)!
  }

  return {
    sampleRate: RATE,
    // Muestras de la banda entre dos instantes (reloj local).
    read(fromMs: number, toMs: number): Float32Array {
      const count = Math.round(((toMs - fromMs) / 1_000) * RATE)
      const out = new Float32Array(count)
      const first = Math.round(((((fromMs % SLOT_MS) + SLOT_MS) % SLOT_MS) / 1_000) * RATE)
      for (let i = 0; i < count; i++) out[i] = recording[(first + i) % recording.length]
      for (const injection of injections) {
        const offset = Math.round(((injection.startMs - fromMs) / 1_000) * RATE)
        for (let i = Math.max(0, offset); i < Math.min(count, offset + injection.samples.length); i++) {
          out[i] += injection.samples[i - offset] * PARTNER_GAIN
        }
      }
      return out
    },
    // La estación a la que va el mensaje contesta en el ciclo siguiente.
    async hear(message: string, startAtMs: number) {
      const partner = partnerFor(message)
      if (!partner) return
      const { reply, state } = partnerReply(partner.config, partner.state, message)
      partner.state = state
      if (!reply) return
      const samples = await encode(reply, PARTNER_TONE_HZ)
      if (!samples) return
      injections.push({ startMs: startAtMs + SLOT_MS, samples })
      const now = Date.now()
      while (injections.length > 0 && injections[0].startMs < now - 60_000) injections.shift()
    },
  }
}

export type SimulatedBand = Awaited<ReturnType<typeof createSimulatedBand>>
