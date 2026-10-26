// ============================================================
// Máquina de estados del QSO FT8 — estilo WSJT-X (lógica pura).
// Estados: idle → cq/call → report/roger → rr73 → done
//   · El que lanza el CQ envía el PRIMER reporte (sin R)
//   · El que responde contesta con R + su reporte
//   · El primer reportero cierra con RR73 (o 73 si se prefiere)
//   · Recibir RR73 = QSO completado (73 de cortesía opcional)
// Reintento: el mensaje de la fase se retransmite en cada slot
// propio hasta recibir respuesta (lo gestiona la UI).
// ============================================================
import { parseFt8, type Ft8Parsed } from './ft8msg'

export type QsoPhase = 'idle' | 'cq' | 'call' | 'report' | 'roger' | 'rr73' | 'done'
export type QsoInitiator = 'me' | 'them' | null

export interface QsoState {
  phase: QsoPhase
  myCall: string
  myGrid: string
  partner: string
  theirGrid: string
  /** Mi reporte hacia la otra estación (SNR medido de su señal). */
  report: number
  use73: boolean
  initiator: QsoInitiator
}

export type QsoEvent = 'complete' | 'partner-confirmed'

export interface QsoTransition {
  state: QsoState
  event?: QsoEvent
}

export function initialQso(myCall: string, myGrid: string): QsoState {
  return {
    phase: 'idle',
    myCall: myCall.toUpperCase(),
    myGrid: myGrid.toUpperCase(),
    partner: '',
    theirGrid: '',
    report: -7,
    use73: false,
    initiator: null,
  }
}

/** Lanzo un CQ: yo seré el primer reportero. */
export function startCq(state: QsoState): QsoState {
  return { ...state, phase: 'cq', initiator: 'me', partner: '' }
}

/** Respondo al CQ de otra estación (doble clic): ella reportará primero. */
export function answerCq(state: QsoState, call: string, theirGrid?: string): QsoState {
  return {
    ...state,
    phase: 'call',
    initiator: 'them',
    partner: call.toUpperCase(),
    theirGrid: (theirGrid ?? '').toUpperCase(),
  }
}

/** Abandona el QSO actual. */
export function stopQso(state: QsoState): QsoState {
  return { ...state, phase: 'idle', partner: '', initiator: null }
}

const clampReport = (n: number): number => Math.max(-20, Math.min(30, Math.round(n)))

/**
 * Procesa un mensaje decodificado. Solo actúa si va dirigido a mí.
 * snrDb = SNR medido de ESTA señal (será mi reporte hacia esa estación).
 */
export function onDecoded(state: QsoState, parsed: Ft8Parsed, snrDb?: number): QsoTransition | null {
  const my = state.myCall.toUpperCase()
  if (!parsed.fromCall || parsed.toCall !== my) return null
  if (parsed.fromCall === my) return null // eco propio

  const report = snrDb !== undefined && Number.isFinite(snrDb) ? clampReport(snrDb) : state.report
  let next: QsoState = {
    ...state,
    partner: parsed.fromCall,
    report,
    theirGrid: parsed.grid ? parsed.grid : state.theirGrid,
  }

  if (parsed.rr73) {
    // Han confirmado mi R+reporte: QSO completado (73 de cortesía si se prefiere)
    if (state.use73) next = { ...next, phase: 'rr73', initiator: 'me' }
    else next = { ...next, phase: 'done', initiator: null }
    return { state: next, event: 'partner-confirmed' }
  }
  if (parsed.is73) {
    next = { ...next, phase: 'done', initiator: null }
    return { state: next, event: 'complete' }
  }
  if (parsed.report !== undefined && parsed.roger) {
    // Roger mi reporte + su reporte: me toca cerrar con RR73/73
    next = { ...next, phase: 'rr73' }
    return { state: next }
  }
  if (parsed.report !== undefined) {
    // Su reporte plano: yo era el primer reportero → respondo R + mi reporte
    next = { ...next, phase: 'roger', initiator: 'them' }
    return { state: next }
  }
  if (parsed.grid) {
    // Respondieron a mi CQ: me toca el primer reporte (plano)
    next = { ...next, phase: 'report', initiator: 'me' }
    return { state: next }
  }
  return null // texto libre u otro contenido: sin cambio de fase
}

/** Tras transmitir el mensaje de la fase: RR73/73 completan el QSO. */
export function onTxSent(state: QsoState): QsoTransition {
  if (state.phase === 'rr73' || state.phase === 'call' || state.phase === 'report' || state.phase === 'roger') {
    if (state.phase === 'rr73') {
      return { state: { ...state, phase: 'done', initiator: null }, event: 'complete' }
    }
  }
  if (state.phase === 'done') return { state }
  return { state }
}

/** Mensaje a transmitir en la fase actual (null si no toca transmitir). */
export function txMessage(state: QsoState): string | null {
  const my = state.myCall || '??????'
  const g = state.myGrid || '----'
  const p = state.partner
  const rpt = fmtReport(state.report)
  switch (state.phase) {
    case 'cq': return `CQ ${my} ${g}`
    case 'call': return p ? `${p} ${my} ${g}` : null
    case 'report': return p ? `${p} ${my} ${rpt}` : null
    case 'roger': return p ? `${p} ${my} R${rpt}` : null
    case 'rr73': return p ? `${p} ${my} ${state.use73 ? '73' : 'RR73'}` : null
    default: return null
  }
}

/** Formato FT8 de reporte: signo + 2 dígitos (-05, +12, +00). */
export function fmtReport(n: number): string {
  const v = Math.max(-50, Math.min(49, Math.round(n)))
  const sign = v >= 0 ? '+' : '-'
  return `${sign}${String(Math.abs(v)).padStart(2, '0')}`
}

/** Reprocesa con el parser compartido (conveniencia para la UI). */
export function decodeAndAdvance(state: QsoState, text: string, snrDb?: number): QsoTransition | null {
  const parsed = parseFt8(text)
  if (!parsed) return null
  return onDecoded(state, parsed, snrDb)
}

export type { Ft8Parsed }
