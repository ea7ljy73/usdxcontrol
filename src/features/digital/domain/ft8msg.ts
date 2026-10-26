// Parser de mensajes FT8 estilo WSJT-X (tipos estándar de texto).
// Clasifica CQ (con variantes dirigidas), QSO (destino, emisor, grid,
// reporte con/sin R, RR73, 73) y texto libre.

export interface Ft8Parsed {
  kind: 'cq' | 'qso' | 'free'
  cqVariant?: string
  toCall: string
  fromCall: string
  grid?: string
  report?: number
  roger?: boolean
  rr73?: boolean
  is73?: boolean
  text?: string
}

const CALL_RE = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9/]{3,}$/
const GRID_RE = /^[A-R]{2}[0-9]{2}$/
const DIRECTED = new Set(['DX', 'TEST', 'NA', 'EU', 'AS', 'AF', 'SA', 'OC', 'POTA', 'SOTA', 'QRP', 'FD'])

/** Analiza un mensaje FT8 decodificado (texto). Devuelve null si no es interpretable. */
export function parseFt8(text: string): Ft8Parsed | null {
  const tokens = text.trim().toUpperCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  if (tokens[0] === 'CQ') {
    let i = 1
    let variant = ''
    if (tokens[i] && DIRECTED.has(tokens[i])) {
      variant = tokens[i]
      i++
    }
    const fromCall = tokens[i] ?? ''
    if (!CALL_RE.test(fromCall) || GRID_RE.test(fromCall)) return null
    let grid: string | undefined
    for (let j = i + 1; j < tokens.length; j++) {
      if (GRID_RE.test(tokens[j])) grid = tokens[j]
    }
    return { kind: 'cq', cqVariant: variant || undefined, toCall: '', fromCall, grid }
  }

  const toCall = tokens[0]
  const fromCall = tokens[1] ?? ''
  if (!CALL_RE.test(toCall) || !CALL_RE.test(fromCall)) return null

  const out: Ft8Parsed = { kind: 'qso', toCall, fromCall }
  const payload = tokens.slice(2)
  if (payload.length === 0) return out
  const p0 = payload[0]
  if (p0 === 'RR73') {
    out.rr73 = true
    return out
  }
  if (p0 === '73') {
    out.is73 = true
    return out
  }
  const m = p0.match(/^(R?)([-+]\d{1,2})$/)
  if (m) {
    out.roger = m[1] === 'R'
    out.report = parseInt(m[2], 10)
    return out
  }
  if (GRID_RE.test(p0)) {
    out.grid = p0
    return out
  }
  out.kind = 'free'
  out.text = payload.join(' ')
  return out
}
