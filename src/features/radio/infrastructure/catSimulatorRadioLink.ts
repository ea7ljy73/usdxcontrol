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
  // Menú 029 DIGI Mode (0/1).
  digi: number
}

export type SimulatorOptions = {
  responseDelayMs?: number
  // 'legacy' imita el firmware de serie (hasta v2.1.0): sin EX, SM, GT ni RL, y AG0 en eco.
  firmware?: 'extended' | 'legacy'
  initial?: Partial<Omit<SimulatorState, 'volume' | 'agc' | 'nr' | 'digi'> & { volume?: number; agc?: number; nr?: number; digi?: number }>
}

const buildIfFrame = (frequency: number, mode: RadioMode): string =>
  `IF${formatFrequencyDigits(frequency)}00000+0000000000${modeToCatDigit(mode)}0000000;`

export const createCatSimulatorLink = (options: SimulatorOptions = {}): RadioLink & { state(): SimulatorState } => {
  const { responseDelayMs = 10, firmware = 'extended', initial = {} } = options
  const state: SimulatorState = {
    frequency: initial.frequency ?? 7_074_000,
    mode: initial.mode ?? 'USB',
    tx: false,
    volume: initial.volume ?? 8,
    agc: initial.agc ?? 1,
    nr: initial.nr ?? 0,
    digi: initial.digi ?? 0,
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
    if (/^XT1$|^FL0$/.test(command)) return `${command};`
    if (firmware === 'legacy') {
      if (command === 'AG0' || /^RT1$|^VX[0-9]$/.test(command)) return `${command};`
      return '?;'
    }
    return processExtended(command)
  }

  // Firmware ampliado v2.2.0 (CAT.md): las escrituras no responden; fuera de rango, «?;».
  const processExtended = (command: string): string => {
    if (command === 'SM' || command === 'SM0') {
      const wobble = Math.round((Math.sin(Date.now() / 700) + 1) * 3 + Math.random() * 3)
      return `SM${String(Math.min(30, 8 + wobble)).padStart(5, '0')};`
    }
    if (command === 'EX0000000') return `EX0000000${state.volume};`
    if (command === 'EX0290000') return `EX0290000${state.digi};`
    if (/^EX0290000[0-9]+$/.test(command)) {
      const value = Number(command.slice(9))
      if (value > 1) return '?;'
      state.digi = value
      return ''
    }
    if (command === 'AG' || command === 'AG0') {
      return `AG${String(state.volume > 15 ? 255 : state.volume * 16).padStart(4, '0')};`
    }
    if (/^AG0[0-9]{3}$/.test(command)) {
      const level = Number(command.slice(3))
      if (level > 255) return '?;'
      state.volume = (level + 8) >> 4
      return ''
    }
    if (command === 'GT') return `GT${String(state.agc).padStart(3, '0')};`
    if (/^GT[0-9]{3}$/.test(command)) {
      const value = Number(command.slice(2))
      if (value > 2) return '?;'
      state.agc = value
      return ''
    }
    if (command === 'RL') return `RL${String(state.nr).padStart(2, '0')};`
    if (/^RL[0-9]{2}$/.test(command)) {
      const value = Number(command.slice(2))
      if (value > 8) return '?;'
      state.nr = value
      return ''
    }
    if (/^VX[0-9]$/.test(command)) return ''
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
