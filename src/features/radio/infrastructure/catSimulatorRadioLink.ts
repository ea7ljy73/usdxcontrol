import { clampFrequency, formatFrequencyDigits } from '@/features/radio/domain/frequency'
import { modeFromCatDigit, modeToCatDigit, type RadioMode } from '@/features/radio/domain/mode'
import type { RadioLink, RadioLinkStatus } from '@/features/radio/application/ports'

type SimulatorState = {
  frequency: number
  mode: RadioMode
  tx: boolean
  volume: number
  agc: number
  nr: number
}

export type SimulatorOptions = {
  responseDelayMs?: number
  initial?: Partial<Omit<SimulatorState, 'volume' | 'agc' | 'nr'> & { volume?: number; agc?: number; nr?: number }>
}

const buildIfFrame = (frequency: number, mode: RadioMode): string =>
  `IF${formatFrequencyDigits(frequency)}00000+0000000000${modeToCatDigit(mode)}0000000;`

export const createCatSimulatorLink = (options: SimulatorOptions = {}): RadioLink & { state(): SimulatorState } => {
  const { responseDelayMs = 10, initial = {} } = options
  const state: SimulatorState = {
    frequency: initial.frequency ?? 7_074_000,
    mode: initial.mode ?? 'USB',
    tx: false,
    volume: initial.volume ?? 40,
    agc: initial.agc ?? 1,
    nr: initial.nr ?? 0,
  }
  let deferredFrequency: number | null = null
  let deferredMode: RadioMode | null = null
  let rxPartial = ''
  let status: RadioLinkStatus = 'disconnected'
  const dataListeners = new Set<(chunk: string) => void>()
  const statusListeners = new Set<(next: RadioLinkStatus) => void>()
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const emitData = (chunk: string) => {
    if (chunk === '') return
    const timer = setTimeout(() => {
      timers.delete(timer)
      dataListeners.forEach((listener) => listener(chunk))
    }, responseDelayMs)
    timers.add(timer)
  }

  const clearTimers = () => {
    timers.forEach(clearTimeout)
    timers.clear()
  }

  const applyFrequency = (value: number) => {
    state.frequency = clampFrequency(value)
  }

  const processFrame = (frame: string): string => {
    if (!frame.endsWith(';')) return ''
    const command = frame.slice(0, -1)
    if (command === 'FA') return `FA${formatFrequencyDigits(state.frequency)};`
    if (command.startsWith('FA')) {
      const digits = command.slice(2).match(/^[0-9]+/)?.[0] ?? ''
      if (digits === '') return ''
      if (state.tx) deferredFrequency = clampFrequency(Number.parseInt(digits, 10))
      else applyFrequency(Number.parseInt(digits, 10))
      return ''
    }
    if (command === 'IF') return buildIfFrame(state.frequency, state.mode)
    if (command === 'MD') return `MD${modeToCatDigit(state.mode)};`
    if (/^MD[0-9]$/.test(command)) {
      const value = modeFromCatDigit(Number(command[2]))
      if (state.tx) deferredMode = value
      else state.mode = value
      return ''
    }
    if (command === 'RX') {
      state.tx = false
      if (deferredFrequency !== null) {
        applyFrequency(deferredFrequency)
        deferredFrequency = null
      }
      if (deferredMode !== null) {
        state.mode = deferredMode
        deferredMode = null
      }
      return 'RX0;'
    }
    if (command === 'TX' || command === 'TX0' || command === 'TX1' || command === 'TX2') {
      state.tx = true
      return ''
    }
    if (command === 'RC') return 'RC;'
    if (command === 'ID') return 'ID020;'
    if (command === 'PS') return 'PS1;'
    if (command === 'AI' || command === 'AI0') return 'AI0;'
    if (/^AG[0-9]$/.test(command) && command[2] === '0') return `${command};`
    if (/^XT1$|^RT1$|^FL0$/.test(command)) {
      return `${command};`
    }
    if (/^VX[0-9]$/.test(command)) return `${command};`
    if (command === 'SM') {
      const wobble = Math.round((Math.sin(Date.now() / 700) + 1) * 20 + Math.random() * 18)
      return `SM${String(Math.min(255, 55 + wobble)).padStart(3, '0')};`
    }
    if (command === 'VO') return `VO${String(state.volume).padStart(2, '0')};`
    if (command === 'AG') return `AG${state.agc};`
    if (command === 'NR') return `NR${state.nr};`
    if (/^VO[0-9][0-9]$/.test(command)) {
      state.volume = Number(command.slice(2))
      return `${command};`
    }
    if (/^AG[0-3]$/.test(command)) {
      state.agc = Number(command[2])
      return `${command};`
    }
    if (/^NR[0-4]$/.test(command)) {
      state.nr = Number(command[2])
      return `${command};`
    }
    return '?;'
  }

  const consume = (chunk: string) => {
    rxPartial += chunk
    let out = ''
    let index = rxPartial.indexOf(';')
    while (index >= 0) {
      const rawFrame = rxPartial.slice(0, index + 1)
      rxPartial = rxPartial.slice(index + 1)
      out += processFrame(rawFrame)
      index = rxPartial.indexOf(';')
    }
    if (rxPartial.length >= 40) {
      out += 'E;'
      rxPartial = ''
    }
    emitData(out)
  }

  return {
    open: async () => {
      status = 'connected'
      statusListeners.forEach((listener) => listener(status))
    },
    close: async () => {
      clearTimers()
      status = 'disconnected'
      statusListeners.forEach((listener) => listener(status))
    },
    send: (data: string) => {
      consume(data)
    },
    onData(listener: (chunk: string) => void) {
      dataListeners.add(listener)
      return () => dataListeners.delete(listener)
    },
    onStatusChange(listener: (next: RadioLinkStatus) => void) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    state: () => ({ ...state }),
  }
}
