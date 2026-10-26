import { describe, it, expect } from 'vitest'
import {
  initialQso, startCq, answerCq, stopQso,
  onDecoded, onTxSent, txMessage, fmtReport, type QsoState,
} from './ft8qso'
import { parseFt8 } from './ft8msg'
import { partnerReply, initialPartnerState, type PartnerState } from './ft8partner'

const ME = 'EA7LJY'
const MYGRID = 'IM78'
const THEM = 'W1AW'
const THEIRGRID = 'FN31'

function mkState(phase: QsoState['phase'], opts: Partial<QsoState> = {}): QsoState {
  return { ...initialQso(ME, MYGRID), phase, use73: false, ...opts }
}

describe('formato de reporte FT8', () => {
  it('signo + 2 digitos, rango de protocolo (-50..+49)', () => {
    expect(fmtReport(-5)).toBe('-05')
    expect(fmtReport(12)).toBe('+12')
    expect(fmtReport(0)).toBe('+00')
    expect(fmtReport(-7.6)).toBe('-08')
    expect(fmtReport(99)).toBe('+49') // clamp de protocolo
  })
})

describe('Flujo A - yo lanzo CQ (yo soy el primer reportero)', () => {
  let qso = initialQso(ME, MYGRID)
  let partner = initialPartnerState()
  const pcfg = { call: THEM, grid: THEIRGRID, snrDb: -10 }
  const seq: string[] = []

  it('TX CQ y la estacion remota responde con su grid', () => {
    qso = startCq(qso)
    const msg = txMessage(qso)
    expect(msg).toBe('CQ EA7LJY IM78')
    seq.push(msg!)
    const r = partnerReply(pcfg, partner, msg!)
    partner = r.state as PartnerState
    expect(r.reply).toBe('EA7LJY ' + THEM + ' ' + THEIRGRID) // tocall = MI indicativo
    seq.push(r.reply as string)
  })

  it('al recibir su grid -> envio MI REPORTE PLANO (sin R)', () => {
    const parsed = parseFt8(seq[seq.length - 1])!
    const r = onDecoded(qso, parsed, -12)!
    qso = r.state
    expect(qso.phase).toBe('report')
    expect(qso.partner).toBe(THEM)
    expect(qso.report).toBe(-12) // SNR medido de su senal
    const msg = txMessage(qso)
    expect(msg).toBe(THEM + ' ' + ME + ' -12') // sin R: soy el primer reportero
    seq.push(msg!)
    const pr = partnerReply(pcfg, partner, msg!)
    partner = pr.state as PartnerState
    expect(pr.reply).toBe('EA7LJY ' + THEM + ' R-10') // roger + su reporte (a MI)
    seq.push(pr.reply as string)
  })

  it('al recibir R+reporte -> envio RR73 y completo el QSO', () => {
    const parsed = parseFt8(seq[seq.length - 1])!
    const r = onDecoded(qso, parsed)!
    qso = r.state
    expect(qso.phase).toBe('rr73')
    const msg = txMessage(qso)
    expect(msg).toBe(THEM + ' ' + ME + ' RR73')
    seq.push(msg!)
    const after = onTxSent(qso)
    qso = after.state
    expect(qso.phase).toBe('done')
    expect(after.event).toBe('complete')
    const pr = partnerReply(pcfg, partner, msg!)
    expect(pr.reply).toBeNull() // la estacion remota se calla al terminar
  })

  it('secuencia completa intercambiada correcta', () => {
    expect(seq).toEqual([
      'CQ EA7LJY IM78',
      'EA7LJY W1AW FN31',
      'W1AW EA7LJY -12',
      'EA7LJY W1AW R-10',
      'W1AW EA7LJY RR73',
    ])
  })
})

describe('Flujo B - ellos lanzan CQ y yo respondo', () => {
  it('answerCq genera la llamada con mi grid y ellos responden con reporte', () => {
    let qso = answerCq(initialQso(ME, MYGRID), THEM, THEIRGRID)
    expect(qso.phase).toBe('call')
    expect(qso.initiator).toBe('them')
    let msg = txMessage(qso)
    expect(msg).toBe(THEM + ' ' + ME + ' ' + MYGRID)

    // Ellos envian su reporte plano dirigido a MI (ellos son el primer reportero)
    const r = onDecoded(qso, parseFt8('EA7LJY ' + THEM + ' -10')!, -8)!
    qso = r.state
    expect(qso.phase).toBe('roger')
    expect(qso.report).toBe(-8)
    msg = txMessage(qso)
    expect(msg).toBe(THEM + ' ' + ME + ' R-08') // R + mi reporte

    // Ellos confirman con RR73 -> QSO completado sin mas TX (use73 = false)
    const r2 = onDecoded(qso, parseFt8('EA7LJY ' + THEM + ' RR73')!)!
    qso = r2.state
    expect(qso.phase).toBe('done')
    expect(r2.event).toBe('partner-confirmed')
    expect(txMessage(qso)).toBeNull()
  })
})

describe('opcion 73 en vez de RR73', () => {
  it('uso73: tras R+reporte envio 73 y completo', () => {
    const qso = mkState('rr73', { partner: THEM, report: -9, use73: true, initiator: 'me' })
    const msg = txMessage(qso)
    expect(msg).toBe(THEM + ' ' + ME + ' 73')
    const after = onTxSent(qso)
    expect(after.state.phase).toBe('done')
    expect(after.event).toBe('complete')
  })

  it('uso73: al recibir RR73 envio 73 de cortesia y completo', () => {
    let qso = mkState('report', { partner: THEM, use73: true })
    qso = onDecoded(qso, parseFt8('EA7LJY ' + THEM + ' R-10')!)!.state
    expect(qso.phase).toBe('rr73')
    expect(txMessage(qso)).toBe(THEM + ' ' + ME + ' 73')
    const after = onTxSent(qso)
    expect(after.state.phase).toBe('done')
  })
})

describe('reintento estilo WSJT-X', () => {
  it('la fase repite el mismo mensaje en cada slot hasta respuesta', () => {
    const qso = answerCq(initialQso(ME, MYGRID), THEM, THEIRGRID)
    const m1 = txMessage(qso)
    const m2 = txMessage(qso)
    expect(m1).toBe(m2)
    expect(m1).toBe(THEM + ' ' + ME + ' ' + MYGRID)
    expect(qso.phase).toBe('call')
  })
})

describe('bucle completo con estacion remota (alternancia de slots)', () => {
  function fullQso(initiator: 'me' | 'them', use73 = false): string[] {
    const seq: string[] = []
    let qso = { ...initialQso(ME, MYGRID), use73 }
    let pstate = initialPartnerState()
    const pcfg = { call: THEM, grid: THEIRGRID, snrDb: -6, use73: false }
    let done = false
    let guard = 0

    const weTx = (msg: string) => {
      const phaseAtTx = qso.phase // fase del mensaje que se está transmitiendo
      seq.push('YO: ' + msg)
      const pr = partnerReply(pcfg, pstate, msg)
      pstate = pr.state as PartnerState
      if (pr.reply) {
        seq.push('EL: ' + pr.reply)
        const r = onDecoded(qso, parseFt8(pr.reply)!, -8)
        if (r) qso = r.state
      }
      // onTxSent aplica a lo RECÉN transmitido (no a lo decodificado después)
      const after = onTxSent({ ...qso, phase: phaseAtTx })
      if (after.event === 'complete') { qso = { ...after.state, phase: 'done' }; done = true }
    }

    if (initiator === 'me') {
      qso = startCq(qso)
      weTx(txMessage(qso)!)
    } else {
      seq.push('EL: CQ W1AW FN31')
      qso = answerCq(qso, THEM, THEIRGRID)
      weTx(txMessage(qso)!)
    }
    while (!done && guard++ < 12) {
      const msg = txMessage(qso)
      if (!msg) break
      weTx(msg)
    }
    return seq
  }

  it('QSO completo iniciado por mi en 5 transmisiones', () => {
    expect(fullQso('me')).toEqual([
      'YO: CQ EA7LJY IM78',
      'EL: EA7LJY W1AW FN31',
      'YO: W1AW EA7LJY -08',
      'EL: EA7LJY W1AW R-06',
      'YO: W1AW EA7LJY RR73',
    ])
  })

  it('QSO completo iniciado por ellos (yo respondo CQ)', () => {
    expect(fullQso('them')).toEqual([
      'EL: CQ W1AW FN31',
      'YO: W1AW EA7LJY IM78',
      'EL: EA7LJY W1AW -06',
      'YO: W1AW EA7LJY R-08',
      'EL: EA7LJY W1AW RR73',
    ])
  })
})

describe('reportes de 0 dB (falsy en JS)', () => {
  it('reporte plano +00 avanza a roger (no se ignora)', () => {
    const qso = mkState('call', { partner: THEM })
    const r = onDecoded(qso, parseFt8(ME + ' ' + THEM + ' +00')!, 0)
    expect(r).not.toBeNull()
    expect(r!.state.phase).toBe('roger')
    expect(txMessage(r!.state)).toBe(THEM + ' ' + ME + ' R+00')
  })

  it('R+00 tras mi reporte avanza a rr73', () => {
    const qso = mkState('report', { partner: THEM })
    const r = onDecoded(qso, parseFt8(ME + ' ' + THEM + ' R+00')!)
    expect(r!.state.phase).toBe('rr73')
    expect(txMessage(r!.state)).toBe(THEM + ' ' + ME + ' RR73')
  })

  it('la estación remota tampoco ignora un reporte -00 recibido', () => {
    const r = partnerReply({ call: THEM, grid: THEIRGRID, snrDb: 0 }, 'answered', THEM + ' ' + ME + ' -00')
    expect(r.reply).toBe(ME + ' ' + THEM + ' R+00')
    expect(r.state).toBe('rogered')
  })
})

describe('utilidades', () => {
  it('stopQso vuelve a idle', () => {
    const s = stopQso(mkState('report', { partner: THEM }))
    expect(s.phase).toBe('idle')
    expect(s.partner).toBe('')
  })

  it('ignora mensajes no dirigidos a mi', () => {
    const qso = mkState('report', { partner: THEM })
    expect(onDecoded(qso, parseFt8('K1ABC G4ABC -05')!)).toBeNull()
  })

  it('ignora mi propio eco', () => {
    const qso = mkState('report', { partner: THEM })
    expect(onDecoded(qso, parseFt8(THEM + ' ' + ME + ' -05')!)).toBeNull()
  })
})
