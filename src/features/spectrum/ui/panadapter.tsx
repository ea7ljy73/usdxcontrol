import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import {
  intensityColor,
  paletteBackground,
  paletteCurve,
  paletteFill,
  paletteGrid,
} from '../domain/palette'
import { buildRulerTicks, rulerStep } from '../domain/ruler'
import { startAudioCapture, type AudioCapture, type AudioAnalyser } from '../infrastructure/audioCapture'

export const SPAN_HZ = 4_800
const DB_MIN = -96
const DB_MAX = -24
const WATERFALL_RATIO = 0.62
const ZOOM_LEVELS = [1, 2, 4] as const

const formatEdgeHz = (hz: number) => {
  const abs = Math.abs(hz)
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : `${abs}`
}

type Props = {
  disabled?: boolean
  simulated?: boolean
  startCapture?: () => Promise<AudioAnalyser>
  vfoHz?: number | null
  bandLabel?: string | null
  sliceLabel?: string | null
  sliceTag?: string | null
  sliceMode?: string | null
  tx?: boolean
  onTuneOffset: (offsetHz: number) => void
  onWheelTune?: (sign: 1 | -1) => void
  onDragTune?: (deltaHz: number) => void
}

const RULER_HEIGHT = 20

export type PanadapterHandle = {
  stopAudio: () => void
}

export const Panadapter = forwardRef<PanadapterHandle, Props>(function Panadapter({
  disabled = false,
  simulated = false,
  startCapture,
  vfoHz = null,
  bandLabel = null,
  sliceLabel = null,
  sliceTag = null,
  sliceMode = null,
  tx = false,
  onTuneOffset,
  onWheelTune,
  onDragTune,
}, ref) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const spectrumRef = useRef<HTMLCanvasElement | null>(null)
  const waterfallRef = useRef<HTMLCanvasElement | null>(null)
  const rowRef = useRef<ImageData | null>(null)
  const captureRef = useRef<AudioCapture | null>(null)
  const analyserRef = useRef<AudioAnalyser['analyser'] | null>(null)
  const [audioState, setAudioState] = useState<'off' | 'on' | 'error'>('off')
  const [zoomIndex, setZoomIndex] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIndex]
  const spanHz = SPAN_HZ / zoom

  useEffect(() => () => captureRef.current?.stop(), [])

  const drawStatic = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const [r, g, b] = paletteBackground()
    const scale = canvas.width / Math.max(1, canvas.clientWidth)
    ctx.fillStyle = `rgb(${r} ${g} ${b})`
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = paletteGrid
    ctx.lineWidth = Math.max(1, scale)
    for (let i = 1; i <= 3; i++) {
      const y = Math.round((canvas.height / 3) * i) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }
  }

  const resize = useCallback(() => {
    const spectrum = spectrumRef.current
    const waterfall = waterfallRef.current
    if (!spectrum || !waterfall) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.round(spectrum.clientWidth * dpr))
    const spectrumHeight = Math.max(8, Math.floor(spectrum.clientHeight * dpr))
    const waterfallHeight = Math.max(8, Math.floor(waterfall.clientHeight * dpr))
    spectrum.width = width
    spectrum.height = spectrumHeight
    waterfall.width = width
    waterfall.height = waterfallHeight
    const row = new ImageData(width, waterfallHeight)
    for (let i = 0; i < width * waterfallHeight; i++) {
      const [r, g, b] = paletteBackground()
      row.data[i * 4] = r
      row.data[i * 4 + 1] = g
      row.data[i * 4 + 2] = b
      row.data[i * 4 + 3] = 255
    }
    rowRef.current = row
    drawStatic(spectrum)
  }, [])

  useEffect(() => {
    resize()
    const element = spectrumRef.current
    const observer = new ResizeObserver(resize)
    if (element) observer.observe(element)
    return () => observer.disconnect()
  }, [resize])

  const draw = useCallback(() => {
    const spectrum = spectrumRef.current
    const waterfall = waterfallRef.current
    const analyser = analyserRef.current
    if (!spectrum || !waterfall) return
    const sCtx = spectrum.getContext('2d')
    const wCtx = waterfall.getContext('2d')
    if (!sCtx || !wCtx) return
    drawStatic(spectrum)
    if (!analyser) return

    const bins = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatFrequencyData(bins)
    const binHz = analyser.context.sampleRate / analyser.fftSize
    const width = spectrum.width
    const waterfallHeight = waterfall.height
    const normalize = (db: number) => Math.min(1, Math.max(0, (db - DB_MIN) / (DB_MAX - DB_MIN)))

    const intensities: number[] = []
    sCtx.beginPath()
    for (let x = 0; x < width; x++) {
      const position = ((x + 0.5) / width) * (spanHz / binHz)
      const lower = Math.max(0, Math.min(bins.length - 1, Math.floor(position)))
      const upper = Math.max(0, Math.min(bins.length - 1, lower + 1))
      const a = bins[lower]
      const b = bins[upper]
      const db = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * (position - Math.floor(position)) : a
      const t = normalize(Number.isFinite(db) ? db : DB_MIN - 10)
      intensities.push(t)
      const y = spectrum.height - 1 - t * (spectrum.height - 1)
      if (x === 0) sCtx.moveTo(x, y)
      else sCtx.lineTo(x, y)
    }
    sCtx.lineTo(width, spectrum.height)
    sCtx.lineTo(0, spectrum.height)
    sCtx.closePath()
    sCtx.fillStyle = paletteFill
    sCtx.fill()
    sCtx.strokeStyle = paletteCurve
    sCtx.stroke()

    const row = rowRef.current
    if (row && row.width === width && row.height === waterfallHeight) {
      const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
      const step = Math.min(waterfallHeight, dpr)
      row.data.copyWithin(0, width * 4 * step)
      for (let x = 0; x < width; x++) {
        const previous = ((waterfallHeight - step - 1) * width + x) * 4
        const pr = row.data[previous]
        const pg = row.data[previous + 1]
        const pb = row.data[previous + 2]
        const [r, g, b] = intensityColor(intensities[x] * 1.2)
        for (let k = 0; k < step; k++) {
          const mix = step === 1 ? 1 : (k + 1) / step
          const offset = ((waterfallHeight - step + k) * width + x) * 4
          row.data[offset] = Math.round(pr + (r - pr) * mix)
          row.data[offset + 1] = Math.round(pg + (g - pg) * mix)
          row.data[offset + 2] = Math.round(pb + (b - pb) * mix)
          row.data[offset + 3] = 255
        }
      }
      wCtx.putImageData(row, 0, 0)
    }
  }, [spanHz])

  useEffect(() => {
    if (audioState !== 'on') return
    let frame = requestAnimationFrame(function loop() {
      draw()
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [audioState, draw])

  const startAudio = async () => {
    try {
      const { capture, analyser } = await (startCapture ?? startAudioCapture)()
      captureRef.current = capture
      analyserRef.current = analyser
      setAudioState('on')
    } catch {
      setAudioState('error')
    }
  }

  const stopAudio = () => {
    captureRef.current?.stop()
    captureRef.current = null
    analyserRef.current = null
    setAudioState('off')
  }

  useImperativeHandle(ref, () => ({ stopAudio }), [])

  const dragStateRef = useRef<{ active: boolean; startX: number; lastX: number; acc: number } | null>(null)
  const overlayRef = useRef<HTMLButtonElement | null>(null)

  const handleTune = (event: MouseEvent<HTMLButtonElement>) => {
    if (dragStateRef.current?.active) return
    const ratio = event.nativeEvent.offsetX / event.currentTarget.clientWidth
    onTuneOffset((ratio - 0.5) * spanHz)
  }

  const onRulerPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = { active: false, startX: event.clientX, lastX: event.clientX, acc: 0 }
    dragStateRef.current = drag
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onRulerPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current
    if (!drag || !onDragTune) return
    const deltaX = event.clientX - drag.lastX
    drag.lastX = event.clientX
    if (!drag.active && Math.abs(event.clientX - drag.startX) > 6) drag.active = true
    if (!drag.active) return
    const width = event.currentTarget.clientWidth || 1
    drag.acc += -deltaX * (spanHz / width)
    const delta = Math.trunc(drag.acc)
    if (delta !== 0) {
      drag.acc -= delta
      onDragTune(delta)
    }
  }

  const onRulerPointerUp = () => {
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

  const audioActive = audioState === 'on'

  const rulerStepHz = rulerStep(spanHz)
  const rulerTicks = vfoHz !== null ? buildRulerTicks(vfoHz, spanHz, rulerStepHz) : []

  return (
    <div
      data-testid="panadapter"
      ref={rootRef}
      className="relative min-h-56 flex-1 overflow-hidden rounded-xl border border-line bg-panel"
    >
      <canvas ref={waterfallRef} data-testid="waterfall-canvas" className="absolute inset-x-0 bottom-0 w-full" style={{ height: `${WATERFALL_RATIO * 100}%` }} />
      <canvas ref={spectrumRef} data-testid="spectrum-canvas" className="absolute inset-x-0 top-0 w-full" style={{ height: `${(1 - WATERFALL_RATIO) * 100}%` }} />
      {rulerTicks.map((tick) => (
        <div
          key={tick.freqHz}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px"
          style={{ left: `${tick.ratio * 100}%`, backgroundColor: 'var(--color-line)' }}
        />
      ))}
      <button
        type="button"
        ref={overlayRef}
        aria-label="Sintonizar en el espectro"
        disabled={disabled}
        onClick={handleTune}
        onPointerDown={onRulerPointerDown}
        onPointerMove={onRulerPointerMove}
        onPointerUp={onRulerPointerUp}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
      />
      <div aria-hidden className="absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2" style={{ backgroundColor: 'var(--color-slice)' }}>
        {sliceLabel && (
          <div data-testid="slice-flag" className="absolute top-0 left-1/2 whitespace-nowrap">
            <div className="flex items-stretch gap-px bg-black/70 font-mono text-[10px] font-semibold">
              {tx ? <span className="bg-tx px-1.5 py-0.5 uppercase text-tx-fg">TX</span> : null}
              {sliceTag ? <span className="bg-accent px-1.5 py-0.5 uppercase text-accent-fg">{sliceTag}</span> : null}
              {sliceMode ? <span className="px-1.5 py-0.5 text-fg/80">{sliceMode}</span> : null}
              {bandLabel ? <span className="px-1.5 py-0.5 text-muted">{bandLabel}</span> : null}
            </div>
            <div className="-mt-px inline-block bg-black/70 px-2 py-1 font-mono text-xl font-semibold tracking-wide text-fg">
              {sliceLabel}
            </div>
          </div>
        )}
        <span className="absolute bottom-0 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-b-0 border-t-[7px] border-x-transparent" style={{ borderTopColor: 'var(--color-slice)', filter: 'drop-shadow(0 1px 0 rgba(0, 0, 0, 0.6))' }} />
      </div>
      <div aria-hidden className="pointer-events-none absolute top-9 right-1 z-10 flex w-7 flex-col justify-between pb-1 text-right text-[9px] font-mono text-muted" style={{ bottom: `${WATERFALL_RATIO * 100}%` }}>
        {[-24, -42, -60, -78, -96].map((db) => (
          <span key={db}>{db}</span>
        ))}
      </div>
      {!audioActive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 flex justify-center"
          style={{ top: `${(1 - WATERFALL_RATIO) * 100}%`, paddingBlock: '2.5rem' }}
        >
          <span
            className={cn(
              'rounded-lg border px-3 py-1 text-xs font-medium',
              disabled ? 'border-line text-muted' : 'border-line bg-panel text-fg',
            )}
          >
            {disabled ? 'Sin radio conectada · pulsa Conectar' : audioState === 'error' ? 'No se pudo capturar el audio de la tarjeta de sonido' : 'Pulsa Audio para ver el espectro'}
          </span>
        </div>
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 border-t border-line"
        style={{ height: RULER_HEIGHT, backgroundColor: 'var(--color-ruler)' }}
      >
        {rulerTicks.length > 0
          ? rulerTicks.map((tick) => (
              <div
                key={tick.freqHz}
                className="absolute bottom-0 flex h-full flex-col items-center"
                style={{ left: `${tick.ratio * 100}%` }}
              >
                <span className="h-1.5 w-px" style={{ backgroundColor: 'var(--color-ruler-fg)' }} />
                <span className="text-[10px] leading-[12px] font-medium font-mono text-ruler-fg" style={{ transform: 'translateX(-50%)' }}>
                  {(tick.freqHz / 1000).toFixed(tick.freqHz % 1000 === 0 ? 0 : 1).replace(/\.0$/, '')}
                </span>
              </div>
            ))
          : (
            <div aria-hidden className="absolute inset-x-0 flex h-full items-center justify-between px-3 text-[10px] font-mono text-ruler-fg/80">
              <span>-{formatEdgeHz(spanHz / 2)}</span>
              <span>VFO</span>
              <span>+{formatEdgeHz(spanHz / 2)}</span>
            </div>
          )}
      </div>
      <div aria-hidden className="pointer-events-none absolute bottom-0 right-1 flex w-9 flex-col justify-around text-right text-[9px] font-mono text-freq-label" style={{ height: `${WATERFALL_RATIO * 100}%` }}>
        {['-5s', '-10s', '-15s', '-20s'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-2">
        {audioActive && <span className="text-xs font-medium text-rx">{simulated ? 'audio simulado' : 'audio'}</span>}
        {audioState === 'error' && <span className="text-xs font-medium text-tx">sin audio</span>}
      </div>
      <div className="absolute inset-y-0 left-0 z-20 flex w-14 flex-col gap-px border-r border-line/70 bg-panel/95">
        <Button
          variant="ghost"
          className="h-11 w-full rounded-none px-0 text-[10px] font-semibold tracking-wider uppercase"
          aria-label={audioActive ? 'Desconectar audio' : 'Conectar audio'}
          onClick={() => (audioActive ? stopAudio() : void startAudio())}
        >
          Audio
        </Button>
        <button
          type="button"
          data-testid="spectrum-zoom"
          aria-label={`${zoom}x, zoom del panadaptador, clic para cambiar`}
          onClick={() => setZoomIndex((current) => (current + 1) % ZOOM_LEVELS.length)}
          className="h-11 w-full border-t border-line/70 font-mono text-[10px] font-semibold tracking-wider text-fg uppercase outline-none transition-colors duration-150 hover:bg-line focus-visible:ring-2 focus-visible:ring-accent"
        >
          {zoom}x
        </button>
      </div>
    </div>
  )
})
