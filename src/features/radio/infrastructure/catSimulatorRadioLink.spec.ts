import { vi, describe, expect, it, afterEach } from 'vitest'
import { createCatSimulatorLink } from './catSimulatorRadioLink'

describe('catSimulatorRadioLink', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('abre y comunica el estado', async () => {
    const link = createCatSimulatorLink()
    const statuses: string[] = []
    link.onStatusChange((s) => statuses.push(s))
    await link.open()
    expect(statuses).toEqual(['connected'])
  })

  it('no emite nada espontáneamente al abrir (poll-only)', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    await vi.advanceTimersByTimeAsync(2000)
    expect(received).toEqual([])
  })

  it('responde a la identificación y al sondeo de frecuencia', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    link.send('ID;FA;')
    await vi.advanceTimersByTimeAsync(50)
    expect(received.join('')).toBe('ID020;FA00007074000;')
  })

  it('aplica el cambio de frecuencia tras FA...', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    link.send('FA00007100000;')
    expect(received).toEqual([])
    link.send('FA;')
    await vi.advanceTimersByTimeAsync(50)
    expect(received.join('')).toBe('FA00007100000;')
  })

  it('aplica el clamp de modo del firmware (MD0 y MD6+)', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    link.send('MD0;MD;MD6;MD;')
    await vi.advanceTimersByTimeAsync(50)
    expect(received.join('')).toBe('MD1;MD5;')
  })

  it('difiere frecuencia y modo mientras transmite, como cat_apply', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    link.send('TX;')
    link.send('FA00007200000;MD3;')
    link.send('FA;')
    await vi.advanceTimersByTimeAsync(50)
    expect(received.join('')).toBe('FA00007074000;')
    link.send('RX;FA;MD;')
    await vi.advanceTimersByTimeAsync(50)
    expect(link.state()).toEqual({ frequency: 7_200_000, mode: 'CW', tx: false, volume: 8, agc: 1, nr: 0, digi: 0 })
    expect(received.join('')).toContain('RX0;FA00007200000;MD3;')
  })

  it('responde a TX sin eco y cambia a transmisión', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    link.send('TX;')
    await vi.advanceTimersByTimeAsync(50)
    expect(received).toEqual([])
    expect(link.state().tx).toBe(true)
  })

  it('responde ?; a comandos desconocidos y como el firmware v2.2.0 al resto', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    link.send('ZZ;AG0;GT002;GT;RL09;EX0000000;CTR56;')
    await vi.advanceTimersByTimeAsync(50)
    expect(received.join('')).toBe('?;AG0128;GT002;?;EX00000008;?;')
  })

  it('imita el firmware de serie: AG0 en eco y sin EX', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink({ firmware: 'legacy' })
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    link.send('AG0;EX0000000;SM0;')
    await vi.advanceTimersByTimeAsync(50)
    expect(received.join('')).toBe('AG0;?;?;')
  })

  it('conserva el comando parcial entre escrituras hasta cerrar la trama', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const received: string[] = []
    link.onData((chunk) => received.push(chunk))
    await link.open()
    link.send('FA0000')
    await vi.advanceTimersByTimeAsync(50)
    expect(received).toEqual([])
    link.send('7100000;FA;')
    await vi.advanceTimersByTimeAsync(50)
    expect(received.join('')).toBe('FA00007100000;')
  })
})
