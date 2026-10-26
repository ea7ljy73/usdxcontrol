import { describe, it, expect } from 'vitest'
import { parseFt8 } from './ft8msg'

describe('parseFt8 — CQ', () => {
  it('CQ sencillo con grid', () => {
    const p = parseFt8('CQ EA7LJY IM78')!
    expect(p.kind).toBe('cq')
    expect(p.fromCall).toBe('EA7LJY')
    expect(p.grid).toBe('IM78')
    expect(p.cqVariant).toBeUndefined()
  })

  it('CQ dirigido (DX) y (TEST)', () => {
    expect(parseFt8('CQ DX W1AW FN31')!.cqVariant).toBe('DX')
    expect(parseFt8('CQ DX W1AW FN31')!.fromCall).toBe('W1AW')
    expect(parseFt8('CQ TEST UA9ABC LO17')!.cqVariant).toBe('TEST')
  })

  it('CQ sin grid', () => {
    const p = parseFt8('CQ PY2ABC')!
    expect(p.fromCall).toBe('PY2ABC')
    expect(p.grid).toBeUndefined()
  })

  it('CQ inválido (sin indicativo) → null', () => {
    expect(parseFt8('CQ IM78')).toBeNull()
  })
})

describe('parseFt8 — QSO', () => {
  it('respuesta a CQ con grid', () => {
    const p = parseFt8('EA7LJY W1AW FN31')!
    expect(p.kind).toBe('qso')
    expect(p.toCall).toBe('EA7LJY')
    expect(p.fromCall).toBe('W1AW')
    expect(p.grid).toBe('FN31')
    expect(p.report).toBeUndefined()
  })

  it('reporte plano (primer reporte, sin R)', () => {
    const p = parseFt8('W1AW EA7LJY -10')!
    expect(p.report).toBe(-10)
    expect(p.roger).toBe(false)
  })

  it('reporte con R (roger + reporte propio)', () => {
    const p = parseFt8('W1AW EA7LJY R-05')!
    expect(p.report).toBe(-5)
    expect(p.roger).toBe(true)
  })

  it('reporte positivo con signo +', () => {
    expect(parseFt8('W1AW EA7LJY +05')!.report).toBe(5)
    expect(parseFt8('W1AW EA7LJY R+12')!.roger).toBe(true)
  })

  it('RR73 y 73', () => {
    expect(parseFt8('EA7LJY W1AW RR73')!.rr73).toBe(true)
    expect(parseFt8('EA7LJY W1AW 73')!.is73).toBe(true)
  })

  it('texto libre', () => {
    const p = parseFt8('W1AW EA7LJY HOLA OM 73')!
    expect(p.kind).toBe('free')
    expect(p.text).toBe('HOLA OM 73')
  })

  it('indicativos compuestos con barra', () => {
    const p = parseFt8('PJ4/K1ABC EA7LJY -08')!
    expect(p.toCall).toBe('PJ4/K1ABC')
    expect(p.report).toBe(-8)
  })

  it('basura → null', () => {
    expect(parseFt8('')).toBeNull()
    expect(parseFt8('123 456')).toBeNull()
  })
})
