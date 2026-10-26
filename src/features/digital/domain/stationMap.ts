import type { DigiDecode } from './decodeList'
import { getEntityCentroid, resolveDxcc } from './dxcc'
import { gridToLatLng, type LatLng } from './grid'

// Estación oída, situada por su locator o, si no lo envía, por el centro de su país.
export type MapStation = {
  call: string
  position: LatLng
  precise: boolean
  grid: string
  country: string
  snrDb: number
  audioHz: number
  lastHeardMs: number
  cq: boolean
}

export const mapStations = (decodes: DigiDecode[], sinceMs = Number.NEGATIVE_INFINITY): MapStation[] => {
  const byCall = new Map<string, MapStation>()
  for (const decode of decodes) {
    const parsed = decode.parsed
    if (decode.tx || !parsed?.fromCall || decode.slotStartMs < sinceMs) continue
    const call = parsed.fromCall
    const known = byCall.get(call)
    if (known && known.lastHeardMs > decode.slotStartMs && known.precise) continue
    const country = resolveDxcc(call)?.entity ?? ''
    const fromGrid = parsed.grid ? gridToLatLng(parsed.grid) : null
    const position = fromGrid ?? (known?.precise ? known.position : null) ?? (country ? getEntityCentroid(country) : null)
    if (!position) continue
    const newer = !known || decode.slotStartMs >= known.lastHeardMs
    byCall.set(call, {
      call,
      position,
      precise: fromGrid !== null || (known?.precise ?? false),
      grid: parsed.grid ?? known?.grid ?? '',
      country,
      snrDb: newer ? decode.snrDb : (known?.snrDb ?? decode.snrDb),
      audioHz: newer ? decode.audioHz : (known?.audioHz ?? decode.audioHz),
      lastHeardMs: Math.max(decode.slotStartMs, known?.lastHeardMs ?? decode.slotStartMs),
      cq: parsed.kind === 'cq' || (known?.cq ?? false),
    })
  }
  return [...byCall.values()].sort((a, b) => b.lastHeardMs - a.lastHeardMs)
}
