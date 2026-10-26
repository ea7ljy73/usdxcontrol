import { describe, expect, it } from 'vitest'
import { isEncodableMessage, isValidCall, standardMessages } from './messages'

describe('mensajes estándar', () => {
  it('genera los seis de WSJT-X', () => {
    const messages = standardMessages({ myCall: 'ea7ljy', myGrid: 'IM76hk', dxCall: 'F5BZB', reportDb: -8 })
    expect(messages.map((m) => m.text)).toEqual([
      'F5BZB EA7LJY IM76',
      'F5BZB EA7LJY -08',
      'F5BZB EA7LJY R-08',
      'F5BZB EA7LJY RR73',
      'F5BZB EA7LJY 73',
      'CQ EA7LJY IM76',
    ])
  })

  it('sin estación DX solo queda el CQ', () => {
    const messages = standardMessages({ myCall: 'EA7LJY', myGrid: 'IM76', dxCall: '', reportDb: 0 })
    expect(messages.filter((m) => m.text !== null).map((m) => m.id)).toEqual(['tx6'])
  })

  it('valida mensajes e indicativos', () => {
    expect(isEncodableMessage('CQ EA7LJY IM76')).toBe(true)
    expect(isEncodableMessage('HOLA, ¿QUÉ TAL?')).toBe(false)
    expect(isEncodableMessage('X'.repeat(38))).toBe(false)
    expect(isValidCall('EA7LJY')).toBe(true)
    expect(isValidCall('EA7LJY/P')).toBe(true)
    expect(isValidCall('HOLA')).toBe(false)
  })
})
