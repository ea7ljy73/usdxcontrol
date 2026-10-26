import { describe, expect, it } from 'vitest'
import { encodeFrame, extractFrames, parseFrame } from './codec'

describe('encodeFrame', () => {
  it('codifica los comandos del subset TS-480', () => {
    expect(encodeFrame({ kind: 'identify' })).toBe('ID;')
    expect(encodeFrame({ kind: 'frequency-get' })).toBe('FA;')
    expect(encodeFrame({ kind: 'frequency-set', frequency: 7_074_000 })).toBe('FA00007074000;')
    expect(encodeFrame({ kind: 'mode-get' })).toBe('MD;')
    expect(encodeFrame({ kind: 'mode-set', mode: 'CW' })).toBe('MD3;')
    expect(encodeFrame({ kind: 'state-get' })).toBe('IF;')
    expect(encodeFrame({ kind: 'ptt-on' })).toBe('TX;')
    expect(encodeFrame({ kind: 'ptt-off' })).toBe('RX;')
    expect(encodeFrame({ kind: 'rit-clear' })).toBe('RC;')
  })
})

describe('extractFrames', () => {
  it('separa tramas consecutivas y conserva el resto parcial', () => {
    const { frames, rest } = extractFrames('ID020;FA00007074000;IF0000')
    expect(frames).toEqual(['ID020;', 'FA00007074000;'])
    expect(rest).toBe('IF0000')
  })

  it('descarta restos de buffer desbordado como hace el firmware con E;', () => {
    const { rest } = extractFrames('X'.repeat(100))
    expect(rest).toBe('')
  })
})

describe('parseFrame', () => {
  it('parsea las respuestas del firmware', () => {
    expect(parseFrame('ID020;')).toEqual({ type: 'identify', id: '020' })
    expect(parseFrame('FA00007074000;')).toEqual({ type: 'frequency', frequency: 7_074_000 })
    expect(parseFrame('MD3;')).toEqual({ type: 'mode', mode: 'CW' })
    expect(parseFrame('RX0;')).toEqual({ type: 'ptt-off' })
    expect(parseFrame('RC;')).toEqual({ type: 'rit-clear' })
    expect(parseFrame('PS1;')).toEqual({ type: 'power-state' })
    expect(parseFrame('AI0;')).toEqual({ type: 'auto-info' })
  })

  it('parsea la trama completa IF del TS-480 (frecuencia y modo)', () => {
    const frame = 'IF0000707400000000+000000000030000000;'
    const response = parseFrame(frame)
    expect(response).toEqual({ type: 'state', frequency: 7_074_000, mode: 'CW' })
  })

  it('clasifica los comandos desconocidos y el overflow', () => {
    expect(parseFrame('?;')).toEqual({ type: 'unknown' })
    expect(parseFrame('E;')).toEqual({ type: 'error' })
    expect(parseFrame('ZZ9;')).toEqual({ type: 'unknown' })
  })

  it('codifica los comandos del firmware ampliado v2.2.0', () => {
    expect(encodeFrame({ kind: 'extended-probe' })).toBe('EX0000000;')
    expect(encodeFrame({ kind: 'meter-get' })).toBe('SM0;')
    expect(encodeFrame({ kind: 'volume-get' })).toBe('AG0;')
    expect(encodeFrame({ kind: 'volume-set', volume: 8 })).toBe('AG0128;')
    expect(encodeFrame({ kind: 'volume-set', volume: 16 })).toBe('AG0255;')
    expect(encodeFrame({ kind: 'volume-set', volume: 99 })).toBe('AG0255;')
    expect(encodeFrame({ kind: 'agc-get' })).toBe('GT;')
    expect(encodeFrame({ kind: 'agc-set', agc: 2 })).toBe('GT002;')
    expect(encodeFrame({ kind: 'agc-set', agc: 99 })).toBe('GT001;')
    expect(encodeFrame({ kind: 'nr-get' })).toBe('RL;')
    expect(encodeFrame({ kind: 'nr-set', nr: 4 })).toBe('RL04;')
    expect(encodeFrame({ kind: 'nr-set', nr: 20 })).toBe('RL08;')
  })

  it('parsea las respuestas del firmware ampliado (S-meter, volumen, AGC, NR y EX)', () => {
    expect(parseFrame('SM00015;')).toEqual({ type: 'meter', meter: 15 })
    expect(parseFrame('AG0128;')).toEqual({ type: 'volume', volume: 8 })
    expect(parseFrame('AG0240;')).toEqual({ type: 'volume', volume: 15 })
    expect(parseFrame('AG0255;')).toEqual({ type: 'volume', volume: 16 })
    // El firmware de serie responde AG0 en eco: no es un volumen.
    expect(parseFrame('AG0;')).toEqual({ type: 'unknown' })
    expect(parseFrame('GT002;')).toEqual({ type: 'agc', agc: 2 })
    expect(parseFrame('GT003;')).toEqual({ type: 'unknown' })
    expect(parseFrame('RL03;')).toEqual({ type: 'nr', nr: 3 })
    expect(parseFrame('RL09;')).toEqual({ type: 'unknown' })
    expect(parseFrame('EX0000000;')).toEqual({ type: 'unknown' })
    expect(parseFrame('EX00000008;')).toEqual({ type: 'menu', item: 0, value: 8 })
    expect(parseFrame('EX0000000-1;')).toEqual({ type: 'menu', item: 0, value: -1 })
  })
})
