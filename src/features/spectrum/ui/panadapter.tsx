import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'
import { useI18n } from '@/i18n/useI18n'
import { Button } from '@/components/ui/button'
import {
  intensityColor,
  panBackground,
  paletteBackground,
  paletteCurve,
  paletteCurveGlow,
  paletteGrid,
  noAudioShade,
  outOfBandShade,
  SPECTRUM_FILL,
  SPECTRUM_SOFT_FILL,
} from '../domain/palette'
import type { SpectrumFeed } from '../application/ports'
import type { AudioView } from '../domain/audioMapping'
import { frameColumns } from '../domain/columns'
import { buildRulerTicks, rulerStep } from '../domain/ruler'
import { followViewCenter, spanOptions, type FreqRange } from '../domain/viewport'
import type { FeedState } from './useSpectrumFeed'

const DB_MIN = -110
const DB_MAX = -20
const DB_LABELS = [-40, -60, -80, -100]
const SPECTRUM_RATIO = 0.42
const RULER_HEIGHT = 22
// Filas de cascada por segundo (una fila = 1 px CSS): fija la escala de tiempo.
const WATERFALL_ROWS_PER_S = 12
const WATERFALL_LABEL_EVERY_S = 5
const DEFAULT_AUDIO_VIEW: AudioView = { sideband: 'upper', pivotHz: 0 }
// Ancho que necesita el slice flag a un lado de la línea antes de cambiarlo de lado.
const FLAG_ROOM_RATIO = 0.3

const formatEdgeHz = (hz: number) => {
  const abs = Math.abs(hz)
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : `${abs}`
}

const formatTick = (hz: number, stepHz: number) => (hz / 1e6).toFixed(stepHz >= 1000 ? 3 : 4)

const dbRatio = (db: number) => (db - DB_MIN) / (DB_MAX - DB_MIN)

const clampRatio = (ratio: number) => Math.min(1, Math.max(0, ratio))

export type PassbandHz = { lowHz: number; highHz: number }

// Trazo del espectro, como en otros programas SDR: relleno con degradado (SDR#),
// solo la línea (GQRX sin relleno) o línea con un relleno tenue (SDR++).
export type SpectrumTrace = 'relleno' | 'linea' | 'suave'
const TRACES: SpectrumTrace[] = ['relleno', 'linea', 'suave']

type Props = {
  disabled?: boolean
  simulated?: boolean
  feed: SpectrumFeed | null
  feedState: FeedState
  onToggleAudio: () => void
  // Espectro de RF de un SDR en lugar del audio de la radio (muted: el uSDX transmite).
  sdr?: { muted: boolean } | null
  vfoHz?: number | null
  band?: FreqRange | null
  passband?: PassbandHz | null
  audioView?: AudioView | null
  sliceFlag?: ReactNode
  onTuneOffset: (offsetHz: number) => void
  // Paso de sintonía: el clic cae en su rejilla y el arrastre avanza pasos enteros.
  tuneStepHz: number
  onWheelTune?: (sign: 1 | -1) => void
  onDragTune?: (steps: number) => void
  trace?: SpectrumTrace
  onTraceChange?: (trace: SpectrumTrace) => void
}

type DrawParams = {
  vfoHz: number | null
  leftHz: number
  spanHz: number
  view: AudioView
  band: FreqRange | null
  trace: SpectrumTrace
}

const ArrowIcon = ({ open }: { open: boolean }) => (
  <svg aria-hidden="true" width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="2">
    {open ? <path d="M21 7H2M7 2L2 7l5 5" /> : <path d="M1 7h19M15 2l5 5-5 5" />}
  </svg>
)

const shiftImage = (image: ImageData, dx: number) => {
  const { width, height, data } = image
  const [r, g, b] = paletteBackground()
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    if (dx > 0) data.copyWithin(row + dx * 4, row, row + (width - dx) * 4)
    else data.copyWithin(row, row - dx * 4, row + width * 4)
    const from = dx > 0 ? 0 : width + dx
    const to = dx > 0 ? dx : width
    for (let x = from; x < to; x++) {
      const offset = row + x * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = 255
    }
  }
}

export function Panadapter({
  disabled = false,
  simulated = false,
  feed,
  feedState,
  onToggleAudio,
  sdr = null,
  vfoHz = null,
  band = null,
  passband = null,
  audioView = null,
  sliceFlag = null,
  tuneStepHz,
  onTuneOffset,
  onWheelTune,
  onDragTune,
  trace = 'relleno',
  onTraceChange,
}: Props) {
  const { t } = useI18n()
  const spectrumRef = useRef<HTMLCanvasElement | null>(null)
  const waterfallRef = useRef<HTMLCanvasElement | null>(null)
  const rowRef = useRef<ImageData | null>(null)
  const feedRef = useRef<SpectrumFeed | null>(null)
  const [zoomId, setZoomId] = useState('band')
  const [menuOpen, setMenuOpen] = useState(true)
  const [viewCenterHz, setViewCenterHz] = useState<number | null>(null)
  const [waterfallCssHeight, setWaterfallCssHeight] = useState(0)

  const options = spanOptions(band)
  const option = options.find((candidate) => candidate.id === zoomId) ?? options[0]
  const spanHz = option.spanHz
  const view = audioView ?? DEFAULT_AUDIO_VIEW

  // La vista sigue al dial solo cuando hace falta (ajuste de estado durante el render).
  const centerHz = vfoHz === null ? null : followViewCenter({ vfoHz, centerHz: viewCenterHz, spanHz, band })
  if (centerHz !== viewCenterHz) setViewCenterHz(centerHz)
  const leftHz = centerHz === null ? 0 : centerHz - spanHz / 2
  const ratioOf = (hz: number) => (hz - leftHz) / spanHz
  const sliceRatio = vfoHz !== null && centerHz !== null ? ratioOf(vfoHz) : 0.5

  const rulerStepHz = rulerStep(spanHz)
  const rulerTicks = centerHz !== null ? buildRulerTicks(centerHz, spanHz, rulerStepHz) : []

  const paramsRef = useRef<DrawParams | null>(null)
  const tickRatiosRef = useRef<number[]>([])
  const peakRef = useRef<Float32Array | null>(null)
  const lastRowAtRef = useRef(0)
  const shownViewRef = useRef<{ leftHz: number; spanHz: number } | null>(null)

  const drawStatic = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scale = canvas.width / Math.max(1, canvas.clientWidth)
    ctx.fillStyle = panBackground
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const params = paramsRef.current
    if (params?.band && params.vfoHz !== null) {
      ctx.fillStyle = outOfBandShade
      const lowX = Math.round(((params.band.fromHz - params.leftHz) / params.spanHz) * canvas.width)
      const highX = Math.round(((params.band.toHz - params.leftHz) / params.spanHz) * canvas.width)
      if (lowX > 0) ctx.fillRect(0, 0, Math.min(lowX, canvas.width), canvas.height)
      if (highX < canvas.width) ctx.fillRect(Math.max(0, highX), 0, canvas.width - Math.max(0, highX), canvas.height)
    }
    ctx.strokeStyle = paletteGrid
    ctx.lineWidth = Math.max(1, scale)
    for (const db of DB_LABELS) {
      const y = Math.round(canvas.height * (1 - dbRatio(db))) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }
    for (const ratio of tickRatiosRef.current) {
      const x = Math.round(canvas.width * ratio) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
  }

  const clearWaterfall = useCallback(() => {
    const waterfall = waterfallRef.current
    const row = rowRef.current
    if (!waterfall || !row) return
    const [r, g, b] = paletteBackground()
    for (let i = 0; i < row.width * row.height; i++) {
      row.data[i * 4] = r
      row.data[i * 4 + 1] = g
      row.data[i * 4 + 2] = b
      row.data[i * 4 + 3] = 255
    }
    waterfall.getContext('2d')?.putImageData(row, 0, 0)
  }, [])

  const resize = useCallback(() => {
    const spectrum = spectrumRef.current
    const waterfall = waterfallRef.current
    if (!spectrum || !waterfall) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.round(spectrum.clientWidth * dpr))
    spectrum.width = width
    spectrum.height = Math.max(8, Math.floor(spectrum.clientHeight * dpr))
    waterfall.width = width
    waterfall.height = Math.max(8, Math.floor(waterfall.clientHeight * dpr))
    rowRef.current = new ImageData(width, waterfall.height)
    peakRef.current = null
    setWaterfallCssHeight(waterfall.clientHeight)
    clearWaterfall()
    drawStatic(spectrum)
  }, [clearWaterfall])

  useEffect(() => {
    resize()
    const observer = new ResizeObserver(resize)
    if (spectrumRef.current) observer.observe(spectrumRef.current)
    if (waterfallRef.current) observer.observe(waterfallRef.current)
    return () => observer.disconnect()
  }, [resize])

  useEffect(() => {
    feedRef.current = feed
    paramsRef.current = centerHz === null ? null : { vfoHz, leftHz, spanHz, view, band, trace }
    tickRatiosRef.current = rulerTicks.map((tick) => tick.ratio)

    // La cascada está anclada a RF: si la vista se desplaza, la historia se desplaza con ella.
    const shown = shownViewRef.current
    const waterfall = waterfallRef.current
    const row = rowRef.current
    if (centerHz !== null && waterfall && row && (!shown || shown.leftHz !== leftHz || shown.spanHz !== spanHz)) {
      if (!shown || shown.spanHz !== spanHz) {
        clearWaterfall()
      } else {
        const dx = Math.round(((shown.leftHz - leftHz) / spanHz) * row.width)
        if (Math.abs(dx) >= row.width) clearWaterfall()
        else if (dx !== 0) {
          shiftImage(row, dx)
          waterfall.getContext('2d')?.putImageData(row, 0, 0)
        }
      }
      peakRef.current = null
      shownViewRef.current = { leftHz, spanHz }
    }
    if (feed === null && spectrumRef.current) drawStatic(spectrumRef.current)
  })

  const draw = useCallback(() => {
    const spectrum = spectrumRef.current
    const waterfall = waterfallRef.current
    const params = paramsRef.current
    if (!spectrum || !waterfall) return
    const sCtx = spectrum.getContext('2d')
    const wCtx = waterfall.getContext('2d')
    if (!sCtx || !wCtx) return
    drawStatic(spectrum)
    const frame = feedRef.current?.read() ?? null
    if (!frame || !params || params.vfoHz === null) return

    const width = spectrum.width
    const height = spectrum.height
    const waterfallHeight = waterfall.height
    const levels = frameColumns(frame, { leftHz: params.leftHz, spanHz: params.spanHz, vfoHz: params.vfoHz, audio: params.view }, width)
    const intensities = new Float32Array(width)
    for (let x = 0; x < width; x++) {
      const db = levels[x]
      intensities[x] = Number.isNaN(db) ? Number.NaN : Math.min(1, Math.max(0, dbRatio(Number.isFinite(db) ? db : DB_MIN - 10)))
    }

    const area = new Path2D()
    const curve = new Path2D()
    let inRun = false
    for (let x = 0; x <= width; x++) {
      const t = x < width ? intensities[x] : Number.NaN
      if (Number.isNaN(t)) {
        if (inRun) {
          area.lineTo(x, height)
          area.closePath()
          inRun = false
        }
        continue
      }
      const y = height - 1 - t * (height - 1)
      if (!inRun) {
        inRun = true
        area.moveTo(x, height)
        curve.moveTo(x, y)
      } else {
        curve.lineTo(x, y)
      }
      area.lineTo(x, y)
      area.lineTo(x + 1, y)
      curve.lineTo(x + 1, y)
    }
    sCtx.fillStyle = noAudioShade
    for (let x = 0; x < width; x++) {
      if (!Number.isNaN(intensities[x])) continue
      let end = x
      while (end < width && Number.isNaN(intensities[end])) end++
      sCtx.fillRect(x, 0, end - x, height)
      x = end
    }
    if (params.trace === 'relleno') {
      const gradient = sCtx.createLinearGradient(0, height, 0, 0)
      SPECTRUM_FILL.forEach(([at, color]) => gradient.addColorStop(at, color))
      sCtx.fillStyle = gradient
      sCtx.fill(area)
    } else if (params.trace === 'suave') {
      const gradient = sCtx.createLinearGradient(0, height, 0, 0)
      SPECTRUM_SOFT_FILL.forEach(([at, color]) => gradient.addColorStop(at, color))
      sCtx.fillStyle = gradient
      sCtx.fill(area)
    }
    sCtx.strokeStyle = paletteCurve
    sCtx.lineJoin = 'round'
    if (params.trace === 'relleno') {
      sCtx.lineWidth = 1
      sCtx.stroke(curve)
    } else {
      // Sin el relleno opaco la línea lo es todo: más gruesa y con un halo suave.
      const dpr = window.devicePixelRatio || 1
      sCtx.lineWidth = Math.max(1.5, 1.5 * dpr)
      sCtx.shadowColor = paletteCurveGlow
      sCtx.shadowBlur = 6 * dpr
      sCtx.stroke(curve)
      sCtx.shadowBlur = 0
    }

    // La cascada guarda el pico de cada columna entre filas y avanza a ritmo fijo,
    // así las marcas de tiempo de la derecha son ciertas.
    if (!peakRef.current || peakRef.current.length !== width) {
      peakRef.current = new Float32Array(width).fill(Number.NaN)
    }
    const peak = peakRef.current
    for (let x = 0; x < width; x++) {
      const t = intensities[x]
      if (!Number.isNaN(t) && !(peak[x] >= t)) peak[x] = t
    }
    const now = performance.now()
    if (now - lastRowAtRef.current < 1000 / WATERFALL_ROWS_PER_S) return
    lastRowAtRef.current = now

    const row = rowRef.current
    if (row && row.width === width && row.height === waterfallHeight) {
      const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
      const step = Math.min(waterfallHeight, dpr)
      const background = paletteBackground()
      row.data.copyWithin(width * 4 * step, 0, width * 4 * (waterfallHeight - step))
      for (let x = 0; x < width; x++) {
        const [r, g, b] = Number.isNaN(peak[x]) ? background : intensityColor((peak[x] - 0.05) * 1.4)
        for (let k = 0; k < step; k++) {
          const offset = (k * width + x) * 4
          row.data[offset] = r
          row.data[offset + 1] = g
          row.data[offset + 2] = b
          row.data[offset + 3] = 255
        }
      }
      wCtx.putImageData(row, 0, 0)
    }
    peak.fill(Number.NaN)
  }, [])

  useEffect(() => {
    if (feed === null) return
    let frame = requestAnimationFrame(function loop() {
      draw()
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [feed, draw])

  const cycleZoom = () => {
    const index = options.findIndex((candidate) => candidate.id === option.id)
    setZoomId(options[(index + 1) % options.length].id)
    setViewCenterHz(null)
  }

  const dragStateRef = useRef<{ active: boolean; startX: number; lastX: number; acc: number } | null>(null)
  const overlayRef = useRef<HTMLButtonElement | null>(null)

  // Dial marcado: mientras se mantiene el botón del ratón, o fijado con doble clic (Intro con teclado,
  // o el botón Fijar en pantallas táctiles) hasta otro doble clic o Escape. Fijado, los cursores lo mueven.
  const [held, setHeld] = useState(false)
  const [locked, setLocked] = useState(false)
  const selected = held || locked
  const lockedNow = locked && !disabled
  if (locked && disabled) setLocked(false)

  const toggleLock = () => {
    if (disabled) return
    setLocked((current) => !current)
    overlayRef.current?.focus()
  }

  // Fijado, los cursores y Escape actúan aunque el foco esté en otro control (salvo campos y diálogos).
  // Va en captura para que el atajo global de ↑/↓ no sume otro paso.
  useEffect(() => {
    if (!lockedNow) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input,select,textarea,[role="dialog"]')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setLocked(false)
        return
      }
      const sign = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 } as const)[event.key as string]
      if (sign === undefined || !onWheelTune) return
      event.preventDefault()
      event.stopPropagation()
      onWheelTune(sign)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [lockedNow, onWheelTune])

  const handleTune = (event: MouseEvent<HTMLButtonElement>) => {
    // Un "clic" de teclado (Enter/Espacio) no trae posición: fija o suelta el dial en vez de sintonizar.
    if (event.detail === 0) {
      toggleLock()
      return
    }
    if (dragStateRef.current?.active || vfoHz === null) return
    const ratio = event.nativeEvent.offsetX / event.currentTarget.clientWidth
    const target = Math.round((leftHz + ratio * spanHz) / tuneStepHz) * tuneStepHz
    onTuneOffset(target - vfoHz)
  }

  const onOverlayPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    setHeld(true)
    const drag = { active: false, startX: event.clientX, lastX: event.clientX, acc: 0 }
    dragStateRef.current = drag
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onOverlayPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current
    if (!drag || !onDragTune) return
    const deltaX = event.clientX - drag.lastX
    drag.lastX = event.clientX
    if (!drag.active && Math.abs(event.clientX - drag.startX) > 6) drag.active = true
    if (!drag.active) return
    const width = event.currentTarget.clientWidth || 1
    // La línea sigue al ratón, pero solo salta cuando se ha arrastrado un paso entero.
    drag.acc += (deltaX * (spanHz / width)) / tuneStepHz
    const steps = Math.trunc(drag.acc)
    if (steps !== 0) {
      drag.acc -= steps
      onDragTune(steps)
    }
  }

  const onOverlayPointerUp = () => {
    setHeld(false)
    const drag = dragStateRef.current
    if (drag && drag.active) {
      setTimeout(() => {
        if (dragStateRef.current === drag) dragStateRef.current = null
      }, 150)
    } else {
      dragStateRef.current = null
    }
  }

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || !onWheelTune) return
    const handler = (event: WheelEvent) => {
      if (disabled) return
      event.preventDefault()
      onWheelTune(event.deltaY < 0 ? 1 : -1)
    }
    overlay.addEventListener('wheel', handler, { passive: false })
    return () => overlay.removeEventListener('wheel', handler)
  }, [disabled, onWheelTune])

  const traceOption = TRACES.includes(trace) ? trace : TRACES[0]
  const audioActive = feedState === 'on'
  const waterfallLabels: number[] = []
  for (let seconds = WATERFALL_LABEL_EVERY_S; seconds * WATERFALL_ROWS_PER_S < waterfallCssHeight - 8; seconds += WATERFALL_LABEL_EVERY_S) {
    waterfallLabels.push(seconds)
  }
  const spectrumBottom = `${SPECTRUM_RATIO * 100}%`
  const waterfallTop = `calc(${SPECTRUM_RATIO * 100}% + ${RULER_HEIGHT}px)`
  const passbandStyle =
    passband !== null && vfoHz !== null && centerHz !== null
      ? {
          left: `${clampRatio(ratioOf(vfoHz + passband.lowHz)) * 100}%`,
          right: `${(1 - clampRatio(ratioOf(vfoHz + passband.highHz))) * 100}%`,
        }
      : null
  // El flag va al lado contrario del audio para no taparlo, salvo que no quepa.
  const preferRight = view.sideband === 'lower'
  const flagOnRight = preferRight ? sliceRatio < 1 - FLAG_ROOM_RATIO : sliceRatio < FLAG_ROOM_RATIO

  return (
    <div data-testid="panadapter" className="relative min-h-96 flex-1 overflow-hidden bg-pan">
      <canvas
        ref={spectrumRef}
        data-testid="spectrum-canvas"
        className="absolute inset-x-0 top-0 w-full"
        style={{ height: spectrumBottom }}
      />
      <canvas
        ref={waterfallRef}
        data-testid="waterfall-canvas"
        className="absolute inset-x-0 bottom-0 w-full"
        style={{ top: waterfallTop, height: `calc(${100 - SPECTRUM_RATIO * 100}% - ${RULER_HEIGHT}px)` }}
      />

      {passbandStyle && (
        <div aria-hidden className="pointer-events-none absolute top-0 bg-filter" style={{ ...passbandStyle, height: spectrumBottom }} />
      )}

      <div
        aria-hidden
        className="absolute inset-x-0 border-y border-black/60 bg-pan-scale"
        style={{ top: spectrumBottom, height: RULER_HEIGHT }}
      >
        {passbandStyle && <div className="absolute inset-y-0 bg-white/15" style={passbandStyle} />}
        {rulerTicks.length > 0 ? (
          rulerTicks.map((tick) => (
            <span
              key={tick.freqHz}
              className="absolute top-0 -translate-x-1/2 text-xs leading-[20px] text-freq-label tabular-nums max-sm:odd:hidden"
              style={{ left: `${tick.ratio * 100}%` }}
            >
              {formatTick(tick.freqHz, rulerStepHz)}
            </span>
          ))
        ) : (
          <div className="absolute inset-0 flex items-center justify-between px-20 text-xs text-freq-label/80">
            <span>-{formatEdgeHz(spanHz / 2)}</span>
            <span>VFO</span>
            <span>+{formatEdgeHz(spanHz / 2)}</span>
          </div>
        )}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-12 border-l border-black/30 bg-pan-scale/55"
      >
        <div className="absolute inset-x-0 top-0" style={{ height: spectrumBottom }}>
          <span className="absolute top-1 right-1.5 text-[10px] text-freq-label/80">dBFS</span>
          {DB_LABELS.map((db) => (
            <span
              key={db}
              className="absolute right-1.5 -translate-y-1/2 text-xs text-freq-label tabular-nums"
              style={{ top: `${(1 - dbRatio(db)) * 100}%` }}
            >
              {db}
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0" style={{ top: waterfallTop }}>
          {waterfallLabels.map((seconds) => (
            <span
              key={seconds}
              className="absolute right-1.5 -translate-y-1/2 text-xs text-freq-label"
              style={{ top: seconds * WATERFALL_ROWS_PER_S }}
            >
              -{seconds}s
            </span>
          ))}
        </div>
      </div>

      {!audioActive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 flex justify-center pt-10"
          style={{ top: waterfallTop }}
        >
          <span className="bg-instrument/70 px-3 py-1 text-xs font-medium text-fg">
            {disabled ? t('spectrum.noRadio') : feedState === 'error' ? t('spectrum.captureFailed') : t('spectrum.pressAudio')}
          </span>
        </div>
      )}

      <button
        type="button"
        ref={overlayRef}
        data-testid="spectrum-tune"
        aria-label={t('spectrum.tuneAria')}
        aria-pressed={selected}
        disabled={disabled}
        onClick={handleTune}
        onDoubleClick={toggleLock}
        onPointerDown={onOverlayPointerDown}
        onPointerMove={onOverlayPointerMove}
        onPointerUp={onOverlayPointerUp}
        onPointerCancel={onOverlayPointerUp}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none outline-none disabled:cursor-default"
      />

      <div
        aria-hidden
        data-testid="slice-line"
        data-selected={selected}
        className={cn(
          'pointer-events-none absolute top-0 z-10 -translate-x-1/2 bg-slice',
          selected ? 'w-0.5' : 'w-px',
        )}
        // Seleccionado (cursores activos): más gruesa y bajando por toda la cascada.
        style={{
          left: `${sliceRatio * 100}%`,
          height: selected ? '100%' : `calc(${spectrumBottom} + ${RULER_HEIGHT}px)`,
        }}
      >
        <span className="absolute -top-px left-1/2 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[10px] border-b-0 border-x-transparent border-t-slice" />
      </div>
      {sliceFlag && (
        <div
          className="pointer-events-none absolute top-2 z-30"
          style={
            flagOnRight
              ? { left: `calc(${sliceRatio * 100}% + 8px)` }
              : { right: `calc(${(1 - sliceRatio) * 100}% + 8px)` }
          }
        >
          {sliceFlag}
        </div>
      )}

      {sdr ? (
        <span
          data-testid="spectrum-source"
          className={cn('pointer-events-none absolute top-1.5 right-14 z-10 text-xs font-medium', sdr.muted ? 'text-tx' : 'text-rx')}
        >
          {sdr.muted ? t('spectrum.sdrPaused') : simulated ? t('spectrum.sdrSimulated') : 'SDR'}
        </span>
      ) : (
        (audioActive || feedState === 'error') && (
          <span
            data-testid="spectrum-source"
            className={cn(
              'pointer-events-none absolute top-1.5 right-14 z-10 text-xs font-medium',
              audioActive ? 'text-rx' : 'text-tx',
            )}
          >
            {audioActive ? (simulated ? t('spectrum.audioSimulated') : t('spectrum.audio')) : t('spectrum.noAudio')}
          </span>
        )
      )}

      <nav aria-label={t('spectrum.menu')} className="absolute top-1 left-1 z-20 flex w-16 flex-col gap-1">
        <Button
          variant="ghost"
          aria-label={menuOpen ? t('spectrum.hideMenu') : t('spectrum.showMenu')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="h-8 w-9 border border-line bg-chrome/85 px-0 text-fg backdrop-blur-sm hover:bg-tile hover:text-fg"
        >
          <ArrowIcon open={menuOpen} />
        </Button>
        {menuOpen && (
          <div className="flex flex-col gap-1 rounded border border-line bg-chrome/85 p-1 backdrop-blur-sm">
            <Button
              variant="tile"
              className={cn('h-10 w-full px-0 text-sm', audioActive && 'text-rx')}
              aria-label={audioActive ? t('spectrum.audioOff') : t('spectrum.audioOn')}
              onClick={onToggleAudio}
            >
              Audio
            </Button>
            <Button
              data-testid="dial-lock"
              variant="tile"
              className="h-10 w-full px-0 text-sm"
              aria-label={locked ? t('spectrum.unlockAria') : t('spectrum.lockAria')}
              aria-pressed={locked}
              disabled={disabled}
              onClick={toggleLock}
            >
              {locked ? t('spectrum.unlock') : t('spectrum.lock')}
            </Button>
            {onTraceChange && (
              <Button
                data-testid="spectrum-trace"
                variant="tile"
                className="h-10 w-full px-0 text-sm"
                aria-label={t('spectrum.traceAria', { name: t(`spectrum.trace.${traceOption}.name`) })}
                onClick={() => onTraceChange(TRACES[(TRACES.indexOf(traceOption) + 1) % TRACES.length])}
              >
                {t(`spectrum.trace.${traceOption}.label`)}
              </Button>
            )}
            <Button
              data-testid="spectrum-zoom"
              variant="tile"
              className="h-10 w-full px-0 text-sm"
              aria-label={t('spectrum.zoomAria', { label: option.label })}

              onClick={cycleZoom}
            >
              {option.label}
            </Button>
          </div>
        )}
      </nav>
    </div>
  )
}
