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
import type { SpectrumFeed } from '@/features/spectrum/application/ports'
import { audioRangeBetween } from '@/features/spectrum/domain/audioMapping'
import { hasSignal } from '@/features/spectrum/domain/signalDetect'
import { AudioScope } from '@/features/spectrum/ui/audioScope'
import { Panadapter } from '@/features/spectrum/ui/panadapter'
import { useSpectrumFeed } from '@/features/spectrum/ui/useSpectrumFeed'
import { digiDialHz } from '@/features/digital/domain/digiFrequencies'
import { DIGI_MODES, type DigiMode } from '@/features/digital/domain/slots'
import { DigiWorkspace } from '@/features/digital/ui/digiWorkspace'
import { useDigital } from '@/features/digital/ui/useDigital'
import { BANDS, bandFromFrequency } from '../domain/band'
import type { SerialPortChoice } from '../application/ports'
import { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ, formatFrequency } from '../domain/frequency'
import { RADIO_MODES, type RadioMode } from '../domain/mode'
import { audioViewFor, passbandFor } from '../domain/passband'
import { AGC_LEVELS, clampNr, MAX_NR, meterPercent, sUnitLabel } from '../domain/receiver'
import { formatStep, nextStepIndex, stepsFrom, TUNING_STEPS } from '../domain/tuning'
import { useRadioSession } from './useRadioSession'
import { FrequencyEditor } from './frequencyEditor'
import { SliceFlag, SMeterScale } from './sliceFlag'
import { UtcClock } from './utcClock'

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
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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
  const { session, snapshot, linkKind, portSelection, spectrumSimulated, spectrumFeeds } = useRadioSession()
  const audio = useSpectrumFeed(spectrumFeeds.audio)
  const { receiver: digi, receiverState: digiState, operator: digiOperator } = useDigital()
  const [digiOn, setDigiOn] = useState(false)
  const [stepIndex, setStepIndex] = useState(3)
  const [scanDirection, setScanDirection] = useState<0 | 1 | -1>(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [vfoPair, setVfoPair] = useState({ a: 7_074_000, b: 7_074_000 })
  const [activeVfo, setActiveVfo] = useState<'A' | 'B'>('A')
  const [ports, setPorts] = useState<SerialPortChoice[]>([])
  const [selectedPort, setSelectedPort] = useState('')
  const dragRef = useRef<{ y: number; moved: boolean; acc: number } | null>(null)
  const editingRef = useRef<HTMLDivElement | null>(null)
  const holdTimers = useRef<{ delay: number | null; repeat: number | null }>({
    delay: null,
    repeat: null,
  })
  const suppressClickUntil = useRef(0)
  const nudgeRef = useRef<(sign: 1 | -1) => void>(() => undefined)
  const previewTimer = useRef<number | null>(null)
  const editStartHz = useRef<number | null>(null)

  const connected = snapshot.linkStatus === 'connected'
  const connecting = snapshot.linkStatus === 'connecting'
  const step = TUNING_STEPS[stepIndex]
  const stepRef = useRef(step)
  const scanWatchRef = useRef<{
    feed: SpectrumFeed | null
    passbandHz: [number, number] | null
  }>({
    feed: null,
    passbandHz: null,
  })
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
  const hzError = hzInvalid ? 'fuera de rango (100 kHz – 60 MHz)' : null

  const nudge = (sign: 1 | -1) => {
    setScanDirection(0)
    if (snapshot.frequency === null) return
    session.requestFrequency(stepsFrom(snapshot.frequency, sign, step))
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

  // El scan se detiene al aparecer señal en el pasabanda. Solo se arma tras pasar
  // por un tramo sin señal, para no quedarse en la que ya se estaba escuchando.
  // Cada tick juzga la trama de audio del paso anterior, que ya ha tenido tiempo de llegar.
  useEffect(() => {
    if (scanDirection === 0 || !connected) return
    let armed = false
    const id = window.setInterval(() => {
      const current = session.getSnapshot().frequency
      if (current === null) return
      const { feed, passbandHz } = scanWatchRef.current
      const signal = hasSignal(feed?.read(), passbandHz)
      if (armed && signal) {
        setScanDirection(0)
        return
      }
      if (!signal) armed = true
      session.requestFrequency(stepsFrom(current, scanDirection, stepRef.current))
    }, SCAN_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [scanDirection, connected, session])

  const toggleScan = (direction: 1 | -1) => {
    if (!connected) return
    // Sin audio no hay con qué decidir dónde parar.
    if (scanDirection !== direction && audio.state === 'off') void audio.start()
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
    // 24 px de arrastre por paso, siempre en pasos enteros de la rejilla.
    drag.acc += pixels / 24
    const whole = Math.trunc(drag.acc)
    if (whole === 0) return
    drag.acc -= whole
    session.requestFrequency(stepsFrom(snapshot.frequency ?? 0, -whole, step))
  }

  const onDialPointerUp = () => {
    if (dragRef.current && !dragRef.current.moved) startEditing()
    dragRef.current = null
  }

  const onDialWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (snapshot.frequency === null || editing) return
    session.requestFrequency(stepsFrom(snapshot.frequency, event.deltaY < 0 ? 1 : -1, step))
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

  const nudgeLarge = (sign: 1 | -1) => {
    setScanDirection(0)
    if (snapshot.frequency === null) return
    session.requestFrequency(stepsFrom(snapshot.frequency, sign * 10, step))
  }

  const closeDigi = () => {
    digiOperator.haltTx()
    digi.stop()
    setDigiOn(false)
  }
  // Sin radio no se transmite ni se escucha (la pantalla FT8 se oculta hasta reconectar).
  const digiVisible = digiOn && connected
  useEffect(() => {
    if (connected) return
    digiOperator.haltTx()
    digi.stop()
  }, [connected, digi, digiOperator])

  // Cerrar la ventana nunca puede dejar la radio en transmisión.
  useEffect(() => {
    const halt = () => digiOperator.haltTx()
    window.addEventListener('pagehide', halt)
    return () => window.removeEventListener('pagehide', halt)
  }, [digiOperator])

  // FT8/FT4 va siempre en USB y en la frecuencia de la banda; pulsar el modo activo cierra la pantalla.
  const tuneDigi = (hz: number) => {
    setScanDirection(0)
    session.requestFrequency(hz)
    if (snapshot.mode !== 'USB') session.requestMode('USB')
  }
  const selectDigiMode = (mode: DigiMode) => {
    if (mode !== digiState.mode) digiOperator.haltTx()
    digi.setMode(mode)
    const dial = band ? digiDialHz(mode, band.id) : null
    if (dial !== null) tuneDigi(dial)
    else if (snapshot.mode !== 'USB') session.requestMode('USB')
    if (digi.getState().status === 'off') void digi.start()
  }
  const toggleDigi = (mode: DigiMode) => {
    if (digiVisible && digiState.mode === mode) {
      closeDigi()
      return
    }
    setDigiOn(true)
    selectDigiMode(mode)
  }

  const passbandAudioHz =
    connected && snapshot.mode
      ? audioRangeBetween(passbandFor(snapshot.mode).lowHz, passbandFor(snapshot.mode).highHz, audioViewFor(snapshot.mode))
      : null
  useEffect(() => {
    scanWatchRef.current = { feed: audio.feed, passbandHz: passbandAudioHz }
  })
  const frequencyText = snapshot.frequency === null ? '---' : formatFrequency(snapshot.frequency)
  const extendedReady = connected && snapshot.extended

  return (
    <div className="flex min-h-svh flex-col bg-bg lg:h-svh">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-chrome px-3 py-1.5">
        <h1 className="text-sm font-semibold">uSDX Control</h1>

        <label className="flex items-center gap-2" title="Volumen de la radio">
          <svg aria-hidden width="20" height="16" viewBox="0 0 18 14" fill="currentColor" className="text-fg">
            <path d="M1 5h3l4-4v12L4 9H1z" />
            <path d="M11 4a4 4 0 0 1 0 6M13 2a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <input
            type="range"
            data-testid="volume"
            aria-label="Volumen"
            min={0}
            max={99}
            step={1}
            value={snapshot.volume ?? 40}
            disabled={!extendedReady}
            onChange={(event) => session.setVolume(Number(event.target.value))}
            className="w-24 accent-(--color-accent) disabled:opacity-40 sm:w-28"
          />
          <span data-testid="volume-value" className="w-5 text-xs text-fg tabular-nums">
            {snapshot.volume ?? '--'}
          </span>
        </label>

        <span data-testid="header-frequency" className="hidden flex-1 text-center text-sm text-fg tabular-nums md:block">
          {connected && snapshot.frequency !== null
            ? `${activeVfo}: ${formatFrequency(snapshot.frequency)}${snapshot.mode ? ` (${snapshot.mode})` : ''}${snapshot.tx ? ' [TX]' : ''}`
            : 'CAT · uSDX'}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 md:ml-0">
          {snapshot.lastError && (
            <span className="hidden max-w-48 truncate text-xs text-error sm:block" title={snapshot.lastError}>
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
              className="h-7 w-44 truncate rounded-md border border-navy-line bg-navy px-2 py-0 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-slice"
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
            variant="pill"
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
          <UtcClock />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {digiVisible ? (
            <DigiWorkspace dialHz={snapshot.frequency} onMode={selectDigiMode} onTune={tuneDigi} />
          ) : (
            <Panadapter
              disabled={!connected}
              simulated={spectrumSimulated}
              feed={audio.feed}
              feedState={audio.state}
              onToggleAudio={() => (audio.state === 'on' ? audio.stop() : void audio.start())}
              vfoHz={snapshot.frequency}
              band={band ? { fromHz: band.fromHz, toHz: band.toHz } : null}
              passband={connected && snapshot.mode ? passbandFor(snapshot.mode) : null}
              audioView={connected && snapshot.mode ? audioViewFor(snapshot.mode) : null}
              sliceFlag={
                connected && (
                  <SliceFlag
                    frequencyLabel={frequencyText}
                    tag={activeVfo}
                    mode={snapshot.mode}
                    tx={snapshot.tx}
                    meter={snapshot.meter}
                    nr={snapshot.nr}
                    agc={snapshot.agc}
                    bandLabel={band?.label ?? null}
                  />
                )
              }
              tuneStepHz={step}
              onTuneOffset={(offsetHz) => {
                setScanDirection(0)
                if (snapshot.frequency !== null) session.requestFrequency(snapshot.frequency + offsetHz)
              }}
              onWheelTune={(sign) => nudge(sign)}
              onDragTune={(steps) => {
                setScanDirection(0)
                if (snapshot.frequency !== null) session.requestFrequency(stepsFrom(snapshot.frequency, steps, step))
              }}
            />
          )}

          <section aria-label={`Slice ${activeVfo}`} className="flex flex-col gap-1 bg-panel p-1.5">
            <div className="flex items-stretch gap-1">
              <Button
                className="w-12 text-lg sm:w-16"
                aria-label="Retroceder diez pasos"
                disabled={!connected}
                onClick={() => nudgeLarge(-1)}
              >
                &lt;&lt;
              </Button>
              <Button
                className="w-12 text-lg sm:w-16"
                aria-label="Bajar frecuencia"
                disabled={!connected}
                onPointerDown={startHold(-1)}
                onPointerUp={endHold}
                onPointerCancel={endHold}
                onLostPointerCapture={endHold}
                onClick={holdClick(-1)}
              >
                &lt;
              </Button>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-3 bg-instrument px-2 py-1.5">
                {editing ? (
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
                        'flex w-max items-center gap-2 border px-2 py-1',
                        hzError ? 'border-error' : 'border-white/20',
                      )}
                    >
                      <span className="text-xs font-medium text-muted">Hz</span>
                      <input
                        data-testid="freq-hz"
                        inputMode="numeric"
                        aria-label="Frecuencia en hercios"
                        aria-invalid={hzError !== null}
                        className={cn(
                          'w-24 bg-transparent text-center text-sm tabular-nums outline-none',
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
                        <span data-testid="freq-hz-error" className="text-xs text-error">
                          {hzError}
                        </span>
                      ) : null}
                    </label>
                  </div>
                ) : (
                  <>
                    <div
                      data-testid="vfo-frequency"
                      role="button"
                      tabIndex={connected ? 0 : -1}
                      aria-label={`Frecuencia VFO ${
                        snapshot.frequency === null ? 'no conectado' : formatFrequency(snapshot.frequency)
                      }, arrastrar o cursores para sintonizar`}
                      onPointerDown={onDialPointerDown}
                      onPointerMove={onDialPointerMove}
                      onPointerUp={onDialPointerUp}
                      onWheel={onDialWheel}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
                          event.preventDefault()
                          nudge(1)
                        }
                        if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
                          event.preventDefault()
                          nudge(-1)
                        }
                        if (event.key === 'Enter') startEditing()
                        if (event.key === 'Escape') event.currentTarget.blur()
                      }}
                      className={cn(
                        'cursor-ns-resize px-1 text-4xl font-light tracking-wide tabular-nums outline-none select-none focus:ring-2 focus:ring-slice sm:text-5xl',
                        connected ? 'text-fg' : 'text-muted',
                      )}
                    >
                      {frequencyText}
                    </div>
                    <span aria-hidden className="relative hidden size-9 shrink-0 rounded-full bg-fg sm:block">
                      <span className="absolute top-1.5 left-1.5 size-2.5 rounded-full bg-instrument" />
                    </span>
                  </>
                )}
              </div>
              <Button
                className="w-12 text-lg sm:w-16"
                aria-label="Subir frecuencia"
                disabled={!connected}
                onPointerDown={startHold(1)}
                onPointerUp={endHold}
                onPointerCancel={endHold}
                onLostPointerCapture={endHold}
                onClick={holdClick(1)}
              >
                &gt;
              </Button>
              <Button
                className="w-12 text-lg sm:w-16"
                aria-label="Avanzar diez pasos"
                disabled={!connected}
                onClick={() => nudgeLarge(1)}
              >
                &gt;&gt;
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1 sm:grid-cols-6" role="group" aria-label="Paso y búsqueda">
              <Button
                data-testid="tuning-step"
                aria-label={`Paso de sintonía ${formatStep(step)}, clic para cambiar`}
                title="Paso de sintonía"
                onClick={() => setStepIndex(nextStepIndex(stepIndex))}
              >
                {formatStep(step)}
              </Button>
              <Button
                variant={scanDirection === -1 ? 'navy' : 'tile'}
                aria-label="Scan hacia abajo"
                aria-pressed={scanDirection === -1}
                disabled={!connected}
                className="gap-1.5"
                onClick={() => toggleScan(-1)}
              >
                <ScanDownIcon />
                Scan
              </Button>
              <Button
                variant={scanDirection === 1 ? 'navy' : 'tile'}
                aria-label="Scan hacia arriba"
                aria-pressed={scanDirection === 1}
                disabled={!connected}
                className="gap-1.5"
                onClick={() => toggleScan(1)}
              >
                <ScanUpIcon />
                Scan
              </Button>
              <Button aria-label="Editar frecuencia" title="Editar frecuencia" disabled={!connected} onClick={startEditing}>
                <PencilIcon />
              </Button>
              <Button variant="tile" aria-label="RIT 0, borrar RIT" disabled={!connected} onClick={() => session.clearRit()}>
                RIT 0
              </Button>
              <Button
                data-testid="vfo-swap"
                aria-label="A ⇄ B, intercambiar VFO A y B"
                disabled={!connected}
                onClick={() => switchVfo(activeVfo === 'A' ? 'B' : 'A')}
              >
                A ⇄ B
              </Button>
            </div>
          </section>
        </main>

        <aside aria-label="Controles de radio" className="flex flex-col gap-px bg-panel-deep lg:w-80 lg:overflow-y-auto">
          <section aria-labelledby="rc-meter" className="bg-panel">
            <h2 id="rc-meter" className="bg-navy px-3 py-1 text-center text-sm font-medium">
              RX
            </h2>
            <div className="m-2 bg-instrument px-3 pt-2 pb-1">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-fg">S-Meter</span>
                <span className="text-sm text-fg tabular-nums">
                  {snapshot.meter !== null ? `${sUnitLabel(snapshot.meter)}${snapshot.tx ? ' · TX' : ''}` : '--'}
                </span>
              </div>
              {snapshot.meter !== null ? (
                <div
                  data-testid="s-meter"
                  role="meter"
                  aria-label={`S-métrico ${sUnitLabel(snapshot.meter)}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={meterPercent(snapshot.meter)}
                  className="mt-1.5 h-2.5 bg-white/10"
                >
                  <div
                    className={cn('h-full transition-[width] duration-150', snapshot.meter > 204 ? 'bg-tx' : 'bg-rx')}
                    style={{ width: `${meterPercent(snapshot.meter)}%` }}
                  />
                </div>
              ) : (
                <div aria-hidden className="mt-1.5 h-2.5 bg-white/10" />
              )}
              <div className="mt-1.5">
                <SMeterScale size="lg" />
              </div>
            </div>
            <div className="mx-2 mb-2 bg-instrument px-3 pt-2 pb-1">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm text-fg">Audio</span>
                <span className="text-xs text-muted">{spectrumSimulated ? 'simulado' : 'tarjeta de sonido'}</span>
              </div>
              <AudioScope feed={audio.feed} passbandAudioHz={passbandAudioHz} />
            </div>
            <div className="flex flex-col gap-1.5 px-2 pb-2" role="group" aria-label="Ajustes de recepción">
              <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 text-sm text-fg">
                  AGC
                  <select
                    data-testid="agc"
                    aria-label="AGC"
                    value={snapshot.agc ?? 1}
                    disabled={!extendedReady}
                    onChange={(event) => session.setAgc(Number(event.target.value))}
                    className="h-9 min-w-0 flex-1 bg-navy px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-slice disabled:opacity-40"
                  >
                    {AGC_LEVELS.map((name, level) => (
                      <option key={name} value={level}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  data-testid="nr"
                  variant={(snapshot.nr ?? 0) > 0 ? 'navy' : 'tile'}
                  aria-label={`NR ${(snapshot.nr ?? 0).toString()} · reducción de ruido, clic para subir`}
                  disabled={!extendedReady}
                  className="h-9 w-24"
                  title="Reducción de ruido"
                  onClick={() => {
                    const current = snapshot.nr ?? 0
                    session.setNr(current >= MAX_NR ? 0 : clampNr(current + 1))
                  }}
                >
                  NR {(snapshot.nr ?? 0).toString()}
                </Button>
              </div>
              {!snapshot.extended && <p className="text-xs text-fg">Volumen, AGC y NR requieren firmware ampliado</p>}
            </div>
          </section>

          <section aria-labelledby="rc-band" className="bg-panel">
            <h2 id="rc-band" className="bg-navy px-3 py-1 text-center text-sm font-medium">
              Band
            </h2>
            <div className="grid grid-cols-5 gap-px p-2" role="group" aria-label="Bandas">
              {BANDS.map((entry) => {
                const active = band?.id === entry.id
                return (
                  <Button
                    key={entry.id}
                    variant={active ? 'navy' : 'tile'}
                    data-testid={`band-${entry.id}`}
                    aria-label={`Banda ${entry.label}, ${formatFrequency(entry.defaultFreqHz)}, clic para saltar`}
                    aria-pressed={active}
                    disabled={!connected}
                    className="h-9 px-1"
                    onClick={() => session.requestFrequency(entry.defaultFreqHz)}
                  >
                    {entry.label}
                  </Button>
                )
              })}
            </div>
          </section>

          <section aria-labelledby="rc-mode" className="bg-panel">
            <h2 id="rc-mode" className="bg-navy px-3 py-1 text-center text-sm font-medium">
              Mode
            </h2>
            <div className="flex gap-1.5 p-2">
              <ToggleGroup
                type="single"
                value={snapshot.mode ?? ''}
                onValueChange={setMode}
                disabled={!connected}
                aria-label="Modo"
                className="flex-[5] grid-cols-5"
              >
                {RADIO_MODES.map((mode) => (
                  <ToggleGroupItem key={mode} value={mode} aria-label={`Modo ${mode}`}>
                    {mode}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="grid flex-[2] grid-cols-2 gap-px" role="group" aria-label="Modos digitales">
                {DIGI_MODES.map((mode) => {
                  const active = digiVisible && digiState.mode === mode
                  return (
                    <Button
                      key={mode}
                      data-testid={`digi-${mode.toLowerCase()}`}
                      variant={active ? 'navy' : 'tile'}
                      aria-pressed={active}
                      disabled={!connected}
                      className="h-9 px-1"
                      onClick={() => toggleDigi(mode)}
                    >
                      {mode}
                    </Button>
                  )
                })}
              </div>
            </div>
          </section>

          <section aria-labelledby="rc-vfo" className="bg-panel">
            <h2 id="rc-vfo" className="bg-navy px-3 py-1 text-center text-sm font-medium">
              VFO
            </h2>
            <div className="flex flex-col gap-px p-2" role="group" aria-label="VFO">
              {(['A', 'B'] as const).map((tag) => {
                const stored = tag === 'A' ? vfoPair.a : vfoPair.b
                const isActive = activeVfo === tag
                const shown = isActive ? (snapshot.frequency ?? stored) : stored
                const badge = (
                  <span
                    className={cn(
                      'px-1.5 text-sm leading-6 font-bold',
                      isActive ? 'bg-accent text-accent-fg' : 'bg-white/15 text-fg',
                    )}
                  >
                    {tag}
                  </span>
                )
                return isActive ? (
                  <div key={tag} aria-label={`Receptor VFO ${tag}`} className="flex h-9 items-center gap-3 bg-instrument px-3">
                    {badge}
                    <span className="ml-auto text-xl font-light tabular-nums">
                      {snapshot.frequency === null ? '---' : formatFrequency(shown)}
                    </span>
                  </div>
                ) : (
                  <Button
                    key={tag}
                    variant="tile"
                    data-testid={`vfo-${tag.toLowerCase()}`}
                    aria-label={`VFO ${tag} ${formatFrequency(shown)}, clic para activar`}
                    disabled={!connected}
                    className="h-9 justify-start gap-3"
                    onClick={() => switchVfo(tag)}
                  >
                    {badge} <span className="ml-auto text-xl font-light tabular-nums">{formatFrequency(shown)}</span>
                  </Button>
                )
              })}
            </div>
          </section>

          <section aria-labelledby="rc-tx" className="flex flex-col bg-panel lg:flex-1">
            <h2 id="rc-tx" className="bg-navy px-3 py-1 text-center text-sm font-medium">
              TX
            </h2>
            <div className="flex flex-1 flex-col gap-2 p-2">
              <Button
                data-testid="ptt"
                variant={snapshot.tx ? 'tx' : 'navy'}
                aria-pressed={snapshot.tx}
                title="Mantener pulsado para transmitir"
                disabled={!connected}
                onPointerDown={onPttPointerDown}
                onPointerUp={pttRelease}
                onPointerCancel={pttRelease}
                onLostPointerCapture={pttRelease}
                onKeyDown={onPttKeyDown}
                onKeyUp={onPttKeyUp}
                className="h-14 w-full touch-none text-2xl font-bold"
              >
                {snapshot.tx ? 'TX' : 'PTT'}
              </Button>
              <p aria-hidden className="mt-auto text-center text-xs text-fg">
                ↑/↓ sintonizar · [ ] paso · m modo · espacio PTT · rueda sobre el espectro
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
