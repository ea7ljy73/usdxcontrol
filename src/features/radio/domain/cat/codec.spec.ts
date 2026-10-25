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

  it('codifica los comandos extendidos de audio y recepción', () => {
    expect(encodeFrame({ kind: 'meter-get' })).toBe('SM;')
    expect(encodeFrame({ kind: 'volume-get' })).toBe('VO;')
    expect(encodeFrame({ kind: 'volume-set', volume: 66 })).toBe('VO66;')
    expect(encodeFrame({ kind: 'volume-set', volume: 250 })).toBe('VO99;')
    expect(encodeFrame({ kind: 'agc-get' })).toBe('AG;')
    expect(encodeFrame({ kind: 'agc-set', agc: 2 })).toBe('AG2;')
    expect(encodeFrame({ kind: 'agc-set', agc: 99 })).toBe('AG1;')
    expect(encodeFrame({ kind: 'nr-get' })).toBe('NR;')
    expect(encodeFrame({ kind: 'nr-set', nr: 4 })).toBe('NR4;')
  })

  it('parsea las respuestas extendidas (S-meter, volumen, AGC y NR)', () => {
    expect(parseFrame('SM137;')).toEqual({ type: 'meter', meter: 137 })
    expect(parseFrame('VO40;')).toEqual({ type: 'volume', volume: 40 })
    expect(parseFrame('VO99;')).toEqual({ type: 'volume', volume: 99 })
    expect(parseFrame('AG2;')).toEqual({ type: 'agc', agc: 2 })
    expect(parseFrame('AG5;')).toEqual({ type: 'unknown' })
    expect(parseFrame('NR3;')).toEqual({ type: 'nr', nr: 3 })
    expect(parseFrame('NR7;')).toEqual({ type: 'unknown' })
  })
})
