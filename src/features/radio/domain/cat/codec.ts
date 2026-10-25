import { formatFrequencyDigits, parseFrequencyDigits, type Frequency } from '../frequency'
import { modeFromCatDigit, modeToCatDigit, type RadioMode } from '../mode'
import { clampAgcLevel, clampNr, clampVolume } from '../receiver'

export type CatCommand =
  | { kind: 'identify' }
  | { kind: 'frequency-get' }
  | { kind: 'frequency-set'; frequency: Frequency }
  | { kind: 'mode-get' }
  | { kind: 'mode-set'; mode: RadioMode }
  | { kind: 'state-get' }
  | { kind: 'ptt-on' }
  | { kind: 'ptt-off' }
  | { kind: 'rit-clear' }
  | { kind: 'meter-get' }
  | { kind: 'volume-get' }
  | { kind: 'volume-set'; volume: number }
  | { kind: 'agc-get' }
  | { kind: 'agc-set'; agc: number }
  | { kind: 'nr-get' }
  | { kind: 'nr-set'; nr: number }

export type CatResponse =
  | { type: 'identify'; id: string }
  | { type: 'frequency'; frequency: Frequency }
  | { type: 'mode'; mode: RadioMode }
  | { type: 'state'; frequency: Frequency; mode: RadioMode }
  | { type: 'ptt-off' }
  | { type: 'rit-clear' }
  | { type: 'power-state' }
  | { type: 'auto-info' }
  | { type: 'meter'; meter: number }
  | { type: 'volume'; volume: number }
  | { type: 'agc'; agc: number }
  | { type: 'nr'; nr: number }
  | { type: 'unknown' }
  | { type: 'error' }

export const encodeFrame = (command: CatCommand): string => {
  switch (command.kind) {
    case 'identify':
      return 'ID;'
    case 'frequency-get':
      return 'FA;'
    case 'frequency-set':
      return `FA${formatFrequencyDigits(command.frequency)};`
    case 'mode-get':
      return 'MD;'
    case 'mode-set':
      return `MD${modeToCatDigit(command.mode)};`
    case 'state-get':
      return 'IF;'
    case 'ptt-on':
      return 'TX;'
    case 'ptt-off':
      return 'RX;'
    case 'rit-clear':
      return 'RC;'
    case 'meter-get':
      return 'SM;'
    case 'volume-get':
      return 'VO;'
    case 'volume-set':
      return `VO${String(clampVolume(command.volume)).padStart(2, '0')};`
    case 'agc-get':
      return 'AG;'
    case 'agc-set':
      return `AG${clampAgcLevel(command.agc)};`
    case 'nr-get':
      return 'NR;'
    case 'nr-set':
      return `NR${clampNr(command.nr)};`
  }
}

export const extractFrames = (buffer: string): { frames: string[]; rest: string } => {
  const parts = buffer.split(';')
  const last = parts.pop() ?? ''
  const rest = last.length > 64 ? '' : last
  return {
    frames: parts.map((part) => `${part};`),
    rest,
  }
}

const idPattern = /^ID[0-9]{3}$/
const faPattern = /^FA[0-9]{11}$/
const mdPattern = /^MD[0-9]$/
const ifPattern = /^IF[0-9]{11}/
const ifModeIndex = 2 + 11 + 16
const ifMinimumLength = ifModeIndex + 1
const smPattern = /^SM[0-9]{3}$/
const voPattern = /^VO[0-9][0-9]$/
const agPattern = /^AG[0-3]$/
const nrPattern = /^NR[0-4]$/

export const parseFrame = (frame: string): CatResponse => {
  if (!frame.endsWith(';') || frame.length < 2) return { type: 'unknown' }
  const body = frame.slice(0, -1)
  if (body === '?') return { type: 'unknown' }
  if (body === 'E') return { type: 'error' }
  if (idPattern.test(body)) return { type: 'identify', id: body.slice(2) }
  if (faPattern.test(body)) return { type: 'frequency', frequency: parseFrequencyDigits(body.slice(2)) }
  if (mdPattern.test(body)) return { type: 'mode', mode: modeFromCatDigit(Number(body[2])) }
  if (ifPattern.test(body) && body.length >= ifMinimumLength) {
    return {
      type: 'state',
      frequency: parseFrequencyDigits(body.slice(2, 13)),
      mode: modeFromCatDigit(Number(body[ifModeIndex])),
    }
  }
  if (body === 'RX0') return { type: 'ptt-off' }
  if (body === 'RC') return { type: 'rit-clear' }
  if (body === 'PS1') return { type: 'power-state' }
  if (body === 'AI0') return { type: 'auto-info' }
  if (smPattern.test(body)) return { type: 'meter', meter: Number(body.slice(2)) }
  if (voPattern.test(body)) return { type: 'volume', volume: Number(body.slice(2)) }
  if (agPattern.test(body)) return { type: 'agc', agc: Number(body[2]) }
  if (nrPattern.test(body)) return { type: 'nr', nr: Number(body[2]) }
  return { type: 'unknown' }
}
