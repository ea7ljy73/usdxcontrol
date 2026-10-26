import { fmtReport } from './ft8qso'

// Los seis mensajes estándar de WSJT-X para el QSO con la estación DX.
export type StdMessageId = 'tx1' | 'tx2' | 'tx3' | 'tx4' | 'tx5' | 'tx6'

export type StdMessage = { id: StdMessageId; label: string; text: string | null }

type Station = { myCall: string; myGrid: string; dxCall: string; reportDb: number }

export const standardMessages = ({ myCall, myGrid, dxCall, reportDb }: Station): StdMessage[] => {
  const me = myCall.trim().toUpperCase()
  const grid = myGrid.trim().toUpperCase().slice(0, 4)
  const dx = dxCall.trim().toUpperCase()
  const report = fmtReport(reportDb)
  const withDx = (text: string) => (me && dx ? text : null)
  return [
    { id: 'tx1', label: 'Llamada', text: withDx(`${dx} ${me} ${grid}`.trim()) },
    { id: 'tx2', label: 'Reporte', text: withDx(`${dx} ${me} ${report}`) },
    { id: 'tx3', label: 'R+Reporte', text: withDx(`${dx} ${me} R${report}`) },
    { id: 'tx4', label: 'RR73', text: withDx(`${dx} ${me} RR73`) },
    { id: 'tx5', label: '73', text: withDx(`${dx} ${me} 73`) },
    { id: 'tx6', label: 'CQ', text: me ? `CQ ${me} ${grid}`.trim() : null },
  ]
}

// Mensaje FT8 válido para el codificador: 37 caracteres como máximo y solo el
// alfabeto de FT8 (A-Z, 0-9, espacio y + - . / ?).
export const isEncodableMessage = (text: string): boolean => /^[A-Z0-9 +\-./?]{1,37}$/.test(text.trim().toUpperCase())

const CALL_RE = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9/]{3,11}$/
export const isValidCall = (call: string): boolean => CALL_RE.test(call.trim().toUpperCase())
