import { formatFrequencyDigits, parseFrequencyDigits, type Frequency } from '../frequency'
import { modeFromCatDigit, modeToCatDigit, type RadioMode } from '../mode'
import { clampAgcLevel, clampNr, clampVolume, MAX_VOLUME } from '../receiver'

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
  | { kind: 'extended-probe' }
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
  | { type: 'menu'; item: number; value: number }
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
    // Firmware ampliado v2.2.0 (CAT.md): S-meter 0..30, volumen por AG0 en escala TS-480
    // 000-255 (16 por paso del menú), AGC por GT y nivel de NR por RL. Escribir no responde.
    case 'meter-get':
      return 'SM0;'
    case 'extended-probe':
      return 'EX0000000;'
    case 'volume-get':
      return 'AG0;'
    case 'volume-set':
      return `AG0${String(Math.min(255, clampVolume(command.volume) * 16)).padStart(3, '0')};`
    case 'agc-get':
      return 'GT;'
    case 'agc-set':
      return `GT${String(clampAgcLevel(command.agc)).padStart(3, '0')};`
    case 'nr-get':
      return 'RL;'
    case 'nr-set':
      return `RL${String(clampNr(command.nr)).padStart(2, '0')};`
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
const smPattern = /^SM0[0-9]{4}$/
const agPattern = /^AG0[0-9]{3}$/
const gtPattern = /^GT00[0-2]$/
const rlPattern = /^RL0[0-8]$/
const exPattern = /^EX([0-9]{3})0000(-?[0-9]+)$/

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
  if (agPattern.test(body)) {
    const level = Number(body.slice(3))
    return { type: 'volume', volume: level >= 255 ? MAX_VOLUME : Math.min(MAX_VOLUME, level >> 4) }
  }
  if (gtPattern.test(body)) return { type: 'agc', agc: Number(body.slice(2)) }
  if (rlPattern.test(body)) return { type: 'nr', nr: Number(body.slice(2)) }
  const menu = exPattern.exec(body)
  if (menu) return { type: 'menu', item: Number(menu[1]), value: Number(menu[2]) }
  return { type: 'unknown' }
}
