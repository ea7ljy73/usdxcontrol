// Locator Maidenhead (IM76, IM76hk) → centro de la cuadrícula en grados, y la ruta
// por círculo máximo entre dos puntos para el mapa (copiado de radiocq).
export type LatLng = [number, number]

export const GRID_RE = /^[A-R]{2}[0-9]{2}([A-X]{2})?$/i

export function gridToLatLng(grid: string): LatLng | null {
  const g = grid.toUpperCase().replace(/[^A-Z0-9]/g, '').trim()
  if (g.length < 4 || !GRID_RE.test(g.slice(0, g.length >= 6 ? 6 : 4))) return null
  let lon = (g.charCodeAt(0) - 65) * 20 + (g.charCodeAt(2) - 48) * 2
  let lat = (g.charCodeAt(1) - 65) * 10 + (g.charCodeAt(3) - 48) * 1
  if (g.length >= 6) {
    lon += (g.charCodeAt(4) - 65) * (1 / 12) + 1 / 24
    lat += (g.charCodeAt(5) - 65) * (1 / 24) + 1 / 48
  } else {
    lon += 1
    lat += 0.5
  }
  return [Number((lat - 90).toFixed(4)), Number((lon - 180).toFixed(4))]
}

export function greatCirclePath(a: LatLng, b: LatLng, steps = 24): LatLng[] {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const lat1 = toRad(a[0])
  const lng1 = toRad(a[1])
  const lat2 = toRad(b[0])
  const lng2 = toRad(b[1])
  const d = Math.acos(
    Math.min(1, Math.max(-1, Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1))),
  )
  const points: LatLng[] = []
  for (let i = 0; i <= steps; i++) {
    if (d < 1e-9) {
      points.push([a[0], a[1]])
      continue
    }
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2)
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    points.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))])
  }
  return points
}

// Distancia en km entre dos locators (null si alguno no es válido).
export function gridDistanceKm(from: string, to: string): number | null {
  const a = gridToLatLng(from)
  const b = gridToLatLng(to)
  if (!a || !b) return null
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)))
}
