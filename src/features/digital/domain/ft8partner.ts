// ============================================================
// Estación remota virtual: sigue el protocolo FT8 estándar (el mismo
// de WSJT-X/JTDX/FT8CN) para simular QSOs completos en pruebas.
// Estados: idle → answered/sentReport → rogered → done
//   · Si la LLAMAN (con grid): envía el primer reporte (plano)
//   · Si ELLA responde a un CQ: espera reporte y contesta R + suyo
//   · Tras R+reporte propio → RR73 · Tras RR73 recibido → fin
// ============================================================
import { parseFt8 } from './ft8msg'
import { fmtReport } from './ft8qso'

export interface PartnerConfig {
  call: string
  grid: string
  /** Reporte que enviará sobre nosotros (SNR que "mide" de nuestra señal). */
  snrDb?: number
  /** Envía 73 de cortesía al recibir RR73. */
  use73?: boolean
}

export type PartnerState = 'idle' | 'answered' | 'sentReport' | 'rogered' | 'done'

export function initialPartnerState(): PartnerState {
  return 'idle'
}

export interface PartnerReply {
  reply: string | null
  state: PartnerState
}

/** Mensaje que la estación remota transmitiría al escuchar `ourMessage`. */
export function partnerReply(cfg: PartnerConfig, state: PartnerState, ourMessage: string): PartnerReply {
  const p = parseFt8(ourMessage)
  if (!p) return { reply: null, state }
  const me = cfg.call
  const rpt = fmtReport(cfg.snrDb ?? -10)

  // CQ: decide responder (el simulador siempre responde a su primer CQ)
  if (p.kind === 'cq') {
    if (state !== 'idle') return { reply: null, state }
    return { reply: `${p.fromCall} ${me} ${cfg.grid}`, state: 'answered' }
  }

  // Solo atiende mensajes dirigidos a ella
  if (p.toCall !== me) return { reply: null, state }
  const from = p.fromCall

  switch (state) {
    case 'idle':
      // Nos llaman con grid → el que llama es el primer reportero… no:
      // quien RECIBE la llamada envía el primer reporte (plano)
      if (p.grid) return { reply: `${from} ${me} ${rpt}`, state: 'sentReport' }
      return { reply: null, state }
    case 'answered':
      // Respondimos a su CQ; esperamos su reporte plano → R + el nuestro
      if (p.report !== undefined && !p.roger) return { reply: `${from} ${me} R${rpt}`, state: 'rogered' }
      return { reply: null, state }
    case 'sentReport':
      // Enviamos el primer reporte; esperamos R + reporte suyo → RR73
      if (p.report !== undefined && p.roger) return { reply: `${from} ${me} RR73`, state: 'done' }
      return { reply: null, state }
    case 'rogered':
      // Enviamos R + reporte; esperamos RR73 → fin (73 opcional)
      if (p.rr73 || p.is73) return { reply: cfg.use73 ? `${from} ${me} 73` : null, state: 'done' }
      return { reply: null, state }
    default:
      return { reply: null, state }
  }
}
