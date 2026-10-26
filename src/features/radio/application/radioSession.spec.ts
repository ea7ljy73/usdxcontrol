import { vi, describe, expect, it, afterEach } from 'vitest'
import { createRadioSession, type RadioSnapshot } from './radioSession'
import { createCatSimulatorLink } from '../infrastructure/catSimulatorRadioLink'

const runUntil = async (ms: number) => vi.advanceTimersByTimeAsync(ms)

describe('radioSession con simulador CAT', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const start = async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const session = createRadioSession(link)
    await session.start()
    await runUntil(1200)
    return { link, session }
  }

  it('conecta por identificación y adopta el estado de la radio', async () => {
    const { session, link } = await start()
    const snapshot = session.getSnapshot()
    expect(snapshot.linkStatus).toBe('connected')
    expect(snapshot.frequency).toBe(7_074_000)
    expect(snapshot.mode).toBe('USB')
    expect(snapshot.tx).toBe(false)
    expect(link.state().tx).toBe(false)
  })

  it('propaga el puerto elegido al enlace al conectar', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const open = vi.spyOn(link, 'open')
    const session = createRadioSession(link)
    await session.start('/dev/ttyUSB0')
    await runUntil(600)
    expect(open).toHaveBeenCalledWith({ path: '/dev/ttyUSB0' })
    session.stop()
    vi.useRealTimers()
  })

  it('adopta los cambios hechos en la radio física (sin intención pendiente)', async () => {
    const { session, link } = await start()
    link.send('FA00007100000;')
    await runUntil(1000)
    expect(session.getSnapshot().frequency).toBe(7_100_000)
  })

  it('sintoniza con actualización optimista y concilia con el sondeo', async () => {
    const { session } = await start()
    session.requestFrequency(7_100_000)
    expect(session.getSnapshot().frequency).toBe(7_100_000)
    expect(session.getSnapshot().pendingFrequency).toBe(true)
    await runUntil(1500)
    const snapshot = session.getSnapshot()
    expect(snapshot.frequency).toBe(7_100_000)
    expect(snapshot.pendingFrequency).toBe(false)
  })

  it('cambia el modo y lo concilia', async () => {
    const { session } = await start()
    session.requestMode('CW')
    expect(session.getSnapshot().mode).toBe('CW')
    await runUntil(1500)
    const snapshot = session.getSnapshot()
    expect(snapshot.mode).toBe('CW')
    expect(snapshot.pendingMode).toBe(false)
  })

  it('mantiene la intención mientras transmite, aunque el sondeo lea el valor antiguo', async () => {
    const { session } = await start()
    session.pttOn()
    expect(session.getSnapshot().tx).toBe(true)
    session.requestFrequency(7_200_000)
    await runUntil(1500)
    const snapshot = session.getSnapshot()
    expect(snapshot.frequency).toBe(7_200_000)
    expect(snapshot.pendingFrequency).toBe(true)
    session.pttOff()
    await runUntil(2500)
    const after = session.getSnapshot()
    expect(after.tx).toBe(false)
    expect(after.frequency).toBe(7_200_000)
    expect(after.pendingFrequency).toBe(false)
  })

  it('reintenta soltar el PTT si la radio no confirma RX0', async () => {
    const { session, link } = await start()
    const frames: string[] = []
    const original = link.send.bind(link)
    let dropped = false
    vi.spyOn(link, 'send').mockImplementation((frame: string) => {
      frames.push(frame)
      if (!dropped && frame === 'RX;') {
        dropped = true
        return
      }
      original(frame)
    })
    session.pttOn()
    session.pttOff()
    await runUntil(1800)
    expect(dropped).toBe(true)
    expect(frames.filter((frame) => frame === 'RX;').length).toBeGreaterThanOrEqual(2)
    expect(link.state().tx).toBe(false)
    expect(session.getSnapshot().tx).toBe(false)
  })

  it('no repite el RX cuando la radio confirma la vuelta a recepción', async () => {
    const { session, link } = await start()
    const frames: string[] = []
    const original = link.send.bind(link)
    vi.spyOn(link, 'send').mockImplementation((frame: string) => {
      frames.push(frame)
      original(frame)
    })
    session.pttOn()
    session.pttOff()
    await runUntil(1800)
    expect(frames.filter((frame) => frame === 'RX;')).toHaveLength(1)
    expect(link.state().tx).toBe(false)
  })

  it('un RX0 atrasado no anula una pulsación de PTT posterior', async () => {
    const { session, link } = await start()
    session.pttOn()
    await runUntil(500)
    session.pttOff()
    session.pttOn()
    await runUntil(1500)
    expect(session.getSnapshot().tx).toBe(true)
    expect(link.state().tx).toBe(true)
  })

  it('notifica a los suscriptores cada cambio', async () => {
    const { session } = await start()
    const snapshots: RadioSnapshot[] = []
    session.subscribe((snapshot) => snapshots.push(snapshot))
    session.requestMode('FM')
    await runUntil(2000)
    expect(snapshots.some((s) => s.mode === 'FM')).toBe(true)
  })

  it('cierra la sesión y limpia temporizadores', async () => {
    const { session } = await start()
    session.stop()
    const snapshot = session.getSnapshot()
    expect(snapshot.linkStatus).toBe('disconnected')
    expect(snapshot.pendingFrequency).toBe(false)
    expect(snapshot.pendingMode).toBe(false)
  })
})

describe('radioSession en modo extendido (firmware ampliado)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const startExtended = async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const session = createRadioSession(link, { extended: true })
    await session.start()
    await runUntil(2400)
    return { link, session }
  }

  it('sondea el S-meter y publica su nivel', async () => {
    const { session } = await startExtended()
    const snapshot = session.getSnapshot()
    expect(snapshot.extended).toBe(true)
    expect(snapshot.meter).not.toBeNull()
    expect(snapshot.meter).toBeGreaterThanOrEqual(0)
    expect(snapshot.meter).toBeLessThanOrEqual(255)
    session.stop()
    expect(session.getSnapshot().meter).toBeNull()
  })

  it('ajusta volumen, AGC y NR con acuse de la radio', async () => {
    const { link, session } = await startExtended()
    expect(session.getSnapshot().volume).toBe(40)
    expect(session.getSnapshot().agc).toBe(1)
    expect(session.getSnapshot().nr).toBe(0)
    session.setVolume(66)
    session.setAgc(2)
    session.setNr(3)
    await runUntil(600)
    expect(session.getSnapshot().volume).toBe(66)
    expect(session.getSnapshot().agc).toBe(2)
    expect(session.getSnapshot().nr).toBe(3)
    expect(link.state().volume).toBe(66)
    expect(link.state().agc).toBe(2)
    expect(link.state().nr).toBe(3)
    session.stop()
  })
})

describe('ritmo del sondeo CAT', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const countPolls = (sent: string[]) => sent.filter((frame) => frame === 'IF;').length

  it('en reposo sondea cada 3 s y, tras una orden, cada 500 ms', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const sent: string[] = []
    const send = link.send.bind(link)
    link.send = (frame: string) => {
      sent.push(frame)
      send(frame)
    }
    const session = createRadioSession(link)
    await session.start()
    // Pasa la ventana de actividad de la conexión.
    await vi.advanceTimersByTimeAsync(6_000)
    sent.length = 0
    await vi.advanceTimersByTimeAsync(9_000)
    expect(countPolls(sent)).toBe(3)

    sent.length = 0
    session.requestFrequency(7_100_000)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(countPolls(sent)).toBeGreaterThanOrEqual(4)
    session.stop()
  })
})

describe('PTT en la cola CAT', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('el PTT sale antes que lo pendiente y transmitiendo no se sondea', async () => {
    vi.useFakeTimers()
    const link = createCatSimulatorLink()
    const sent: string[] = []
    const send = link.send.bind(link)
    link.send = (frame: string) => {
      sent.push(frame)
      send(frame)
    }
    const session = createRadioSession(link)
    await session.start()
    await vi.advanceTimersByTimeAsync(1_000)
    session.requestFrequency(7_100_000)
    session.pttOn()
    sent.length = 0
    await vi.advanceTimersByTimeAsync(200)
    expect(sent[0]).toBe('TX;')
    sent.length = 0
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sent.filter((frame) => frame === 'IF;')).toEqual([])
    session.pttOff()
    session.stop()
  })
})
