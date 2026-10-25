import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/cn'
import { Panadapter, type PanadapterHandle } from '@/features/spectrum/ui/panadapter'
import { BANDS, bandFromFrequency } from '../domain/band'
import type { SerialPortChoice } from '../application/ports'
import { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ, formatFrequency } from '../domain/frequency'
import { RADIO_MODES, type RadioMode } from '../domain/mode'
import { clampNr, MAX_NR, meterPercent, sUnitLabel } from '../domain/receiver'
import { formatStep, nextStepIndex, TUNING_STEPS } from '../domain/tuning'
import { useRadioSession } from './useRadioSession'
import { FrequencyEditor } from './frequencyEditor'

const ScanUpIcon = () => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M8 13V3M3 8l5-5 5 5" />
  </svg>
)

const ScanDownIcon = () => (
  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M8 3v10M3 8l5 5 5-5" />
  </svg>
)

const PencilIcon = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 14l3-.5L14 4.5 11.5 2 2.5 11z" />
  </svg>
)

const statusLabels = {
  disconnected: { label: 'Desconectado', tone: 'muted' },
  connecting: { label: 'Conectando', tone: 'muted' },
  connected: { label: 'Conectado', tone: 'ok' },
} as const

const HOLD_DELAY_MS = 350
const HOLD_REPEAT_MS = 90
const SCAN_INTERVAL_MS = 300
const PREVIEW_DEBOUNCE_MS = 200

export function RadioScreen() {
  const { session, snapshot, linkKind, portSelection, spectrumSimulated } = useRadioSession()
  const [stepIndex, setStepIndex] = useState(3)
  const [scanDirection, setScanDirection] = useState<0 | 1 | -1>(0)
  const panadapterRef = useRef<PanadapterHandle | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [vfoPair, setVfoPair] = useState({ a: 7_074_000, b: 7_074_000 })
  const [activeVfo, setActiveVfo] = useState<'A' | 'B'>('A')
  const [ports, setPorts] = useState<SerialPortChoice[]>([])
  const [selectedPort, setSelectedPort] = useState('')
  const dragRef = useRef<{ y: number; moved: boolean; acc: number } | null>(null)
  const editingRef = useRef<HTMLDivElement | null>(null)
  const holdTimers = useRef<{ delay: number | null; repeat: number | null }>({ delay: null, repeat: null })
  const suppressClickUntil = useRef(0)
  const nudgeRef = useRef<(sign: 1 | -1) => void>(() => undefined)
  const previewTimer = useRef<number | null>(null)
  const editStartHz = useRef<number | null>(null)

  const connected = snapshot.linkStatus === 'connected'
  const connecting = snapshot.linkStatus === 'connecting'
  const step = TUNING_STEPS[stepIndex]
  const stepRef = useRef(step)
  const band = snapshot.frequency !== null ? bandFromFrequency(snapshot.frequency) : null
  const { label: statusLabel, tone: statusTone } = statusLabels[snapshot.linkStatus]
  const portChoicesAvailable = portSelection !== null && !connected && !connecting

  useEffect(() => {
    if (!portChoicesAvailable) return
    let cancelled = false
    portSelection
      .list()
      .then((choices) => {
        if (cancelled) return
        setPorts(choices)
        setSelectedPort((current) => (current === '' ? (choices[0]?.path ?? '') : current))
      })
      .catch(() => setPorts([]))
    return () => {
      cancelled = true
    }
  }, [portChoicesAvailable, portSelection])

  const connect = () => {
    void session.start(selectedPort === '' ? undefined : selectedPort)
  }

  const clearPreviewTimer = () => {
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current)
    previewTimer.current = null
  }

  const startEditing = () => {
    setScanDirection(0)
    if (snapshot.frequency === null) return
    editStartHz.current = snapshot.frequency
    setDraft('')
    setEditing(true)
  }

  useEffect(() => clearPreviewTimer, [])

  const hzDraft = () => (draft === '' ? String(snapshot.frequency ?? '') : draft)
  const hzParsed = () => Number.parseInt(hzDraft(), 10)
  const hzInvalid = !Number.isFinite(hzParsed()) || hzParsed() < MIN_FREQUENCY_HZ || hzParsed() > MAX_FREQUENCY_HZ
  const hzError = hzInvalid
    ? 'fuera de rango (100 kHz – 60 MHz)'
    : null

  const nudge = (sign: 1 | -1) => {
    setScanDirection(0)
    if (snapshot.frequency === null) return
    session.requestFrequency(snapshot.frequency + sign * step)
  }
  useEffect(() => {
    nudgeRef.current = nudge
  })
  useEffect(() => {
    stepRef.current = step
  }, [step])

  const stopHold = () => {
    if (holdTimers.current.delay !== null) window.clearTimeout(holdTimers.current.delay)
    if (holdTimers.current.repeat !== null) window.clearInterval(holdTimers.current.repeat)
    holdTimers.current = { delay: null, repeat: null }
  }

  const startHold = (sign: 1 | -1) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!connected) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    stopHold()
    panadapterRef.current?.stopAudio()
    holdTimers.current.delay = window.setTimeout(() => {
      holdTimers.current.delay = null
      suppressClickUntil.current = performance.now() + 500
      nudgeRef.current(sign)
      holdTimers.current.repeat = window.setInterval(() => nudgeRef.current(sign), HOLD_REPEAT_MS)
    }, HOLD_DELAY_MS)
  }

  const endHold = () => {
    stopHold()
  }

  const holdClick = (sign: 1 | -1) => () => {
    if (performance.now() < suppressClickUntil.current) return
    nudge(sign)
  }

  useEffect(() => stopHold, [])

  useEffect(() => {
    if (scanDirection === 0 || !connected) return
    const id = window.setInterval(() => {
      const current = session.getSnapshot().frequency
      if (current === null) return
      session.requestFrequency(current + scanDirection * stepRef.current)
    }, SCAN_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [scanDirection, connected, session])

  const toggleScan = (direction: 1 | -1) => {
    if (!connected) return
    panadapterRef.current?.stopAudio()
    setScanDirection((current) => (current === direction ? 0 : direction))
  }

  const pttPress = () => {
    if (!connected) return
    setScanDirection(0)
    session.pttOn()
  }

  const pttRelease = () => {
    session.pttOff()
  }

  const onPttPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pttPress()
  }

  const onPttKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (event.repeat) return
    pttPress()
  }

  const onPttKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    pttRelease()
  }

  useEffect(() => {
    const release = () => session.pttOff()
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('blur', release)
      release()
    }
  }, [session])

  useEffect(() => {
    if (connected || !snapshot.tx) return
    session.pttOff()
  }, [connected, snapshot.tx, session])

  const cycleStep = (direction: 1 | -1) => {
    setStepIndex((current) => (current + direction + TUNING_STEPS.length) % TUNING_STEPS.length)
  }

  const cycleMode = (direction: 1 | -1) => {
    if (snapshot.mode === null) return
    const current = RADIO_MODES.indexOf(snapshot.mode)
    const next = (current + direction + RADIO_MODES.length) % RADIO_MODES.length
    session.requestMode(RADIO_MODES[next])
  }

  useEffect(() => {
    const isTextTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false
      return target.closest('input,select,textarea,button,[data-testid="vfo-frequency"],[data-testid="freq-editor"]') !== null
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      if (isTextTarget(event.target)) return
      const keys: Record<string, () => void> = {
        ArrowUp: () => nudge(1),
        ArrowDown: () => nudge(-1),
        ']': () => cycleStep(1),
        '[': () => cycleStep(-1),
        m: () => cycleMode(1),
        M: () => cycleMode(-1),
      }
      const action = keys[event.key]
      if (action) {
        event.preventDefault()
        action()
        return
      }
      if (event.key === ' ' && connected) {
        event.preventDefault()
        session.pttOn()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ') return
      if (isTextTarget(event.target)) return
      session.pttOff()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  })

  const onDialPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (snapshot.frequency === null || editing) return
    dragRef.current = { y: event.clientY, moved: false, acc: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onDialPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const pixels = event.clientY - drag.y
    if (Math.abs(pixels) > 3) drag.moved = true
    if (!drag.moved) return
    drag.y = event.clientY
    drag.acc += pixels * (step / 24)
    const whole = Math.trunc(drag.acc)
    if (whole === 0) return
    drag.acc -= whole
    session.requestFrequency((snapshot.frequency ?? 0) - whole)
  }

  const onDialPointerUp = () => {
    if (dragRef.current && !dragRef.current.moved) startEditing()
    dragRef.current = null
  }

  const onDialWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (snapshot.frequency === null || editing) return
    session.requestFrequency(snapshot.frequency + (event.deltaY < 0 ? step : -step))
  }

  const switchVfo = (target: 'A' | 'B') => {
    setScanDirection(0)
    if (target === activeVfo) return
    const current = snapshot.frequency
    if (current !== null) {
      setVfoPair((pair) => ({
        a: activeVfo === 'A' ? current : pair.a,
        b: activeVfo === 'B' ? current : pair.b,
      }))
    }
    const targetHz = target === 'A' ? vfoPair.a : vfoPair.b
    session.requestFrequency(targetHz)
    setActiveVfo(target)
    session.requestFrequency(target === 'A' ? vfoPair.a : vfoPair.b)
  }

  const setMode = (value: string) => {
    if (value !== '') session.requestMode(value as RadioMode)
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel/70 px-3 py-1.5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-wider uppercase">uSDX Control</h1>
          <span data-testid="header-frequency" className="hidden font-mono text-[11px] text-muted md:block">
            {connected && snapshot.frequency !== null
              ? `${activeVfo}: ${formatFrequency(snapshot.frequency)}${snapshot.mode ? ` (${snapshot.mode})` : ''}`
              : 'CAT · uSDX'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {snapshot.lastError && (
            <span className="hidden max-w-48 truncate text-xs text-tx sm:block" title={snapshot.lastError}>
              {snapshot.lastError}
            </span>
          )}
          {portChoicesAvailable ? (
            <select
              data-testid="port-select"
              aria-label="Puerto serie"
              disabled={ports.length === 0}
              value={selectedPort}
              onChange={(event) => setSelectedPort(event.target.value)}
              className="h-9 rounded-lg border border-line bg-panel px-2 py-0 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {ports.length === 0 ? (
                <option value="">Sin puertos serie</option>
              ) : (
                ports.map((port) => (
                  <option key={port.path} value={port.path}>
                    {port.label}
                  </option>
                ))
              )}
            </select>
          ) : null}
          <span className="hidden text-xs text-muted sm:block">{linkKind}</span>
          <Badge tone={statusTone} data-testid="connection-status">
            {statusLabel}
          </Badge>
          <Button
            variant={connected ? 'default' : 'primary'}
            disabled={connecting}
            onClick={() => {
              if (connected || connecting) {
                setScanDirection(0)
                session.stop()
              } else {
                connect()
              }
            }}
            aria-label={connected ? 'Desconectar radio' : 'Conectar radio'}
          >
            {connecting ? 'Conectando' : connected ? 'Desconectar' : 'Conectar'}
          </Button>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col gap-2 p-2">
        <Panadapter
          disabled={!connected}
          simulated={spectrumSimulated}
          startCapture={
            spectrumSimulated
              ? () => import('@/features/spectrum/infrastructure/spectrumSimulator').then((m) => m.createSimulatedAudioCapture())
              : undefined
          }
          vfoHz={snapshot.frequency}
          bandLabel={band?.label ?? null}
          sliceLabel={snapshot.frequency !== null ? formatFrequency(snapshot.frequency) : null}
          sliceTag={activeVfo}
          sliceMode={snapshot.mode}
          ref={panadapterRef}
          tx={snapshot.tx}
          onTuneOffset={(offsetHz) => {
            setScanDirection(0)
            if (snapshot.frequency !== null) session.requestFrequency(snapshot.frequency + offsetHz)
          }}
          onWheelTune={(sign) => nudge(sign)}
          onDragTune={(deltaHz) => {
            setScanDirection(0)
            if (snapshot.frequency !== null) session.requestFrequency(snapshot.frequency + deltaHz)
          }}
        />

        <section aria-label="Sintonía y control" className="rounded-md border border-line bg-panel/60 p-3">
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex w-full items-center gap-1 overflow-x-auto border-b border-line pb-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
              role="group"
              aria-label="Bandas"
              tabIndex={0}
            >
              <span className="mr-1 shrink-0 text-[10px] font-semibold tracking-wider text-muted uppercase">Band</span>
              {BANDS.map((entry) => {
                const active = band?.id === entry.id
                return (
                  <button
                    key={entry.id}
                    type="button"
                    data-testid={`band-${entry.id}`}
                    aria-label={`Banda ${entry.label}, ${formatFrequency(entry.defaultFreqHz)}, clic para saltar`}
                    aria-pressed={active}
                    disabled={!connected}
                    onClick={() => session.requestFrequency(entry.defaultFreqHz)}
                    className={cn(
                      'shrink-0 rounded-sm px-2 py-1 font-mono text-[11px] font-semibold uppercase outline-none transition-colors duration-150',
                      'focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40',
                      active ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-line hover:text-fg',
                    )}
                  >
                    {entry.label}
                  </button>
                )
              })}
            </div>

            <div className="relative grid w-full grid-cols-1 gap-3 md:grid-cols-2" role="group" aria-label="VFO">
              {(['A', 'B'] as const).map((tag) => {
                const stored = tag === 'A' ? vfoPair.a : vfoPair.b
                const shown = activeVfo === tag ? (snapshot.frequency ?? stored) : stored
                const isActive = activeVfo === tag
                return (
                  <div
                    key={tag}
                    aria-label={`Receptor VFO ${tag}`}
                    className={cn(
                      'relative flex flex-col gap-2 overflow-hidden rounded-md border bg-panel p-3 transition-colors duration-150',
                      isActive ? 'border-slice/60' : 'border-line',
                    )}
                  >
                    {isActive ? (
                      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: 'var(--color-slice)' }} />
                    ) : null}
                    <div className="flex items-center justify-between gap-2 pl-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase',
                            isActive ? 'bg-accent text-accent-fg' : 'bg-line/60 text-muted',
                          )}
                        >
                          {tag}
                        </span>
                        <span className="font-mono text-[11px] tracking-wider text-muted uppercase">
                          {tag === activeVfo ? snapshot.mode ?? '' : ''}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] tracking-wider text-muted uppercase">
                        {tag === activeVfo ? band?.label ?? '' : ''}
                      </span>
                    </div>
                    {isActive && snapshot.meter !== null ? (
                      <div className="flex items-center gap-2">
                        <div
                          data-testid="s-meter"
                          role="meter"
                          aria-label={`S-métrico ${sUnitLabel(snapshot.meter)}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={meterPercent(snapshot.meter)}
                          className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm border border-line bg-black/50"
                        >
                          <div
                            className={cn('h-full transition-[width] duration-150', snapshot.meter > 204 ? 'bg-tx' : 'bg-rx')}
                            style={{ width: `${meterPercent(snapshot.meter)}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right font-mono text-[10px] text-muted">
                          {sUnitLabel(snapshot.meter)}{snapshot.tx ? ' · TX' : ''}
                        </span>
                      </div>
                    ) : null}
                    {editing && isActive ? (
                      <div
                        ref={editingRef}
                        className="flex flex-col items-center gap-1.5"
                        onBlurCapture={(event) => {
                          if (editingRef.current === null) return
                          if (editingRef.current.contains(event.relatedTarget as Node | null)) return
                          setEditing(false)
                        }}
                      >
                        <FrequencyEditor
                          hz={snapshot.frequency ?? 0}
                          onPreview={(hz) => {
                            clearPreviewTimer()
                            previewTimer.current = window.setTimeout(() => session.requestFrequency(hz), PREVIEW_DEBOUNCE_MS)
                          }}
                          onCommit={(hz) => {
                            clearPreviewTimer()
                            editStartHz.current = null
                            setEditing(false)
                            session.requestFrequency(hz)
                          }}
                          onCancel={() => {
                            clearPreviewTimer()
                            const original = editStartHz.current
                            editStartHz.current = null
                            setEditing(false)
                            if (original !== null) session.requestFrequency(original)
                          }}
                        />
                        <label
                          className={cn(
                            'flex w-max items-center gap-2 rounded-lg border px-2 py-1',
                            hzError ? 'border-error' : 'border-line',
                          )}
                        >
                          <span className="text-[10px] font-medium tracking-wider text-muted uppercase">Hercios</span>
                          <input
                            data-testid="freq-hz"
                            inputMode="numeric"
                            aria-label="Frecuencia en hercios"
                            aria-invalid={hzError !== null}
                            className={cn(
                              'w-24 bg-transparent text-center font-mono text-sm outline-none',
                              hzError ? 'text-error' : 'text-fg',
                            )}
                            value={draft === '' ? String(snapshot.frequency ?? '') : draft}
                            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
                            onBlur={() => {
                              const hz = Number.parseInt(draft, 10)
                              if (draft !== '' && Number.isFinite(hz) && !hzError) {
                                setEditing(false)
                                session.requestFrequency(hz)
                              } else {
                                setEditing(false)
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !hzError) {
                                session.requestFrequency(hzParsed())
                                setEditing(false)
                              }
                              if (event.key === 'Escape') setEditing(false)
                            }}
                          />
                          {hzError ? (
                            <span data-testid="freq-hz-error" className="text-[10px] text-error">
                              {hzError}
                            </span>
                          ) : null}
                        </label>
                      </div>
                    ) : isActive ? (
                      <div
                        data-testid="vfo-frequency"
                        role="button"
                        tabIndex={connected ? 0 : -1}
                        aria-label={`Frecuencia VFO ${
                          snapshot.frequency === null ? 'no conectado' : formatFrequency(snapshot.frequency)
                        }, arrastrar para sintonizar`}
                        onPointerDown={onDialPointerDown}
                        onPointerMove={onDialPointerMove}
                        onPointerUp={onDialPointerUp}
                        onWheel={onDialWheel}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowUp') { event.preventDefault(); nudge(1) }
                          if (event.key === 'ArrowDown') { event.preventDefault(); nudge(-1) }
                          if (event.key === 'Enter') startEditing()
                        }}
                        className={cn(
                          'cursor-ns-resize select-none py-1 text-center font-mono text-4xl font-semibold tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          connected ? 'text-fg' : 'text-muted',
                        )}
                      >
                        {snapshot.frequency === null ? '---' : formatFrequency(snapshot.frequency)}
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid={`vfo-${tag.toLowerCase()}`}
                        aria-label={`VFO ${tag} ${formatFrequency(shown)}, clic para activar`}
                        disabled={!connected}
                        onClick={() => switchVfo(tag)}
                        className="select-none rounded-lg py-2 text-center font-mono text-3xl font-medium tracking-wide text-muted outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                      >
                        {formatFrequency(shown)}
                      </button>
                    )}
                    {isActive ? (
                      <div className="flex items-center justify-center gap-1" role="group" aria-label="Paso de sintonía">
                        <Button
                          variant="ghost"
                          aria-label="Bajar frecuencia"
                          disabled={!connected}
                          onPointerDown={startHold(-1)}
                          onPointerUp={endHold}
                          onPointerCancel={endHold}
                          onLostPointerCapture={endHold}
                          onClick={holdClick(-1)}
                        >
                          −
                        </Button>
                        <button
                          type="button"
                          data-testid="tuning-step"
                          aria-label={`Paso de sintonía ${formatStep(step)}, clic para cambiar`}
                          onClick={() => setStepIndex(nextStepIndex(stepIndex))}
                          className="rounded-sm border border-line px-3 py-2 font-mono text-xs text-fg outline-none transition-colors duration-150 hover:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {formatStep(step)}
                        </button>
                        <Button
                          variant="ghost"
                          aria-label="Subir frecuencia"
                          disabled={!connected}
                          onPointerDown={startHold(1)}
                          onPointerUp={endHold}
                          onPointerCancel={endHold}
                          onLostPointerCapture={endHold}
                          onClick={holdClick(1)}
                        >
                          +
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label="Scan hacia arriba"
                          aria-pressed={scanDirection === 1}
                          disabled={!connected}
                          className={cn('gap-1 px-2 text-[11px] font-semibold uppercase', scanDirection === 1 && 'bg-accent text-accent-fg')}
                          onClick={() => toggleScan(1)}
                        >
                          <ScanUpIcon />
                          Scan
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label="Scan hacia abajo"
                          aria-pressed={scanDirection === -1}
                          disabled={!connected}
                          className={cn('gap-1 px-2 text-[11px] font-semibold uppercase', scanDirection === -1 && 'bg-accent text-accent-fg')}
                          onClick={() => toggleScan(-1)}
                        >
                          <ScanDownIcon />
                          Scan
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label="Editar frecuencia"
                          disabled={!connected}
                          className="px-2"
                          onClick={startEditing}
                        >
                          <PencilIcon />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              <Button
                variant="ghost"
                disabled={!connected}
                className="mx-auto md:absolute md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
                data-testid="vfo-swap"
                aria-label="Intercambiar VFO A y B"
                onClick={() => switchVfo(activeVfo === 'A' ? 'B' : 'A')}
              >
                ⇄
              </Button>
            </div>

            <div
              className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-sm border border-line bg-bg/50 px-3 py-2"
              role="group"
              aria-label="Ajustes de audio y recepción"
            >
              <label className="flex items-center gap-2 text-[10px] font-medium tracking-wider text-muted uppercase">
                Volumen
                <input
                  type="range"
                  data-testid="volume"
                  aria-label="Volumen"
                  min={0}
                  max={99}
                  step={1}
                  value={snapshot.volume ?? 40}
                  disabled={!connected || !snapshot.extended}
                  onChange={(event) => session.setVolume(Number(event.target.value))}
                  className="w-32 accent-(--color-accent) disabled:opacity-40"
                />
                <span data-testid="volume-value" className="w-5 font-mono text-[11px] text-fg">
                  {snapshot.volume ?? '--'}
                </span>
              </label>
              <label className="flex items-center gap-2 text-[10px] font-medium tracking-wider text-muted uppercase">
                AGC
                <select
                  data-testid="agc"
                  aria-label="AGC"
                  value={snapshot.agc ?? 1}
                  disabled={!connected || !snapshot.extended}
                  onChange={(event) => session.setAgc(Number(event.target.value))}
                  className="rounded-lg border border-line bg-panel px-2 py-1 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                >
                  {(['OFF', 'AUTO', 'FAST', 'SLOW'] as const).map((name) => (
                    <option key={name} value={name === 'OFF' ? 0 : name === 'AUTO' ? 1 : name === 'FAST' ? 2 : 3}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                data-testid="nr"
                aria-label={`NR ${(snapshot.nr ?? 0).toString()} · reducción de ruido, clic para subir`}
                disabled={!connected || !snapshot.extended}
                onClick={() => {
                  const current = snapshot.nr ?? 0
                  session.setNr(current >= MAX_NR ? 0 : clampNr(current + 1))
                }}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none transition-colors duration-150',
                  'focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40',
                  (snapshot.nr ?? 0) > 0 ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg',
                )}
              >
                NR {(snapshot.nr ?? 0).toString()}
              </button>
              {!snapshot.extended && <span className="text-[10px] text-muted">requiere firmware ampliado · docs/cat-extensiones-peticion.md</span>}
            </div>

            <div className="flex w-full flex-wrap items-center justify-center gap-3 border-t border-line pt-3">
              <ToggleGroup
                type="single"
                value={snapshot.mode ?? ''}
                onValueChange={setMode}
                disabled={!connected}
                aria-label="Modo"
              >
                {RADIO_MODES.map((mode) => (
                  <ToggleGroupItem key={mode} value={mode} aria-label={`Modo ${mode}`}>
                    {mode}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              <Button
                data-testid="ptt"
                aria-pressed={snapshot.tx}
                title="Mantener pulsado para transmitir"
                disabled={!connected}
                variant="default"
                onPointerDown={onPttPointerDown}
                onPointerUp={pttRelease}
                onPointerCancel={pttRelease}
                onLostPointerCapture={pttRelease}
                onKeyDown={onPttKeyDown}
                onKeyUp={onPttKeyUp}
                className={cn(
                  'h-14 w-32 touch-none rounded-md text-base font-semibold tracking-wide text-tx-fg uppercase select-none',
                  snapshot.tx ? 'bg-ptt' : 'bg-ptt-ok',
                )}
              >
                {snapshot.tx ? 'TX' : 'PTT'}
              </Button>
            </div>

            <p aria-hidden className="text-center text-[10px] text-muted">
              ↑/↓ sintonizar · [ ] paso · m modo · scan ▲/▼ · mantener espacio o PTT para transmitir · rueda sobre VFO
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
