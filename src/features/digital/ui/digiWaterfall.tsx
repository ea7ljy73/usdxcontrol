import { useEffect, useRef } from 'react'
import { Field, Range, Select } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { WATERFALL_PALETTES } from '../domain/palettes'
import { LevelMeter } from './levelMeter'
import { useDigital, useStoredState } from './useDigital'

const MAX_HZ = 3_000
const AXIS_HZ = [500, 1_000, 1_500, 2_000, 2_500]
const DB_FLOOR = -110
const DB_SPAN = 80
const PALETTE_NAMES: Record<string, string> = {
  clasico: 'Clásica',
  espectro: 'Espectro',
  fuego: 'Fuego',
  mono: 'Verde',
}

type View = {
  palette: string
  spectrum: boolean
  brightness: number
  contrast: number
  floor: number
  speed: number
  controls: boolean
}

const DEFAULT_VIEW: View = {
  palette: 'clasico',
  spectrum: true,
  brightness: 1,
  contrast: 1.4,
  floor: 0.1,
  speed: 1,
  controls: false,
}

// Cascada de audio 0–3 kHz de la pantalla FT8 (como la de WSJT-X): clic fija la frecuencia de RX
// (y la de TX salvo Hold Tx Freq); Mayús + clic solo la de TX.
export function DigiWaterfall() {
  const { receiver, receiverState, operator, operatorState, transmitter } = useDigital()
  const [view, setView] = useStoredState<View>('digi.waterfall', DEFAULT_VIEW)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef(view)
  const paused = receiverState.status === 'paused'
  const pausedRef = useRef(paused)
  const { toneHz, rxHz } = operatorState.settings

  useEffect(() => {
    viewRef.current = view
    pausedRef.current = paused
  }, [view, paused])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const width = Math.max(64, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(64, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    let row: ImageData | null = null
    let frame = requestAnimationFrame(function loop() {
      frame = requestAnimationFrame(loop)
      const ctx = canvas.getContext('2d')
      const spectrum = receiver.input()?.spectrum()
      if (!ctx || !spectrum || spectrum.kind !== 'audio' || pausedRef.current) return
      const { palette, spectrum: showSpectrum, brightness, contrast, floor, speed } = viewRef.current
      const lut = WATERFALL_PALETTES[palette] ?? WATERFALL_PALETTES.clasico
      const { width, height } = canvas
      const top = showSpectrum ? Math.round(height * 0.3) : 0
      const fall = height - top
      const level = new Float32Array(width)
      for (let x = 0; x < width; x++) {
        const from = Math.floor(((x / width) * MAX_HZ) / spectrum.binHz)
        const to = Math.max(from + 1, Math.floor((((x + 1) / width) * MAX_HZ) / spectrum.binHz))
        let peak = -Infinity
        for (let bin = from; bin < to && bin < spectrum.bins.length; bin++) peak = Math.max(peak, spectrum.bins[bin])
        const v = Math.min(1, Math.max(0, (peak - DB_FLOOR) / DB_SPAN))
        level[x] = Math.min(1, Math.max(0, (v * brightness - floor) * contrast))
      }
      // Cascada: baja lo pintado y añade la fila nueva arriba.
      if (fall > speed) ctx.drawImage(canvas, 0, top, width, fall - speed, 0, top + speed, width, fall - speed)
      if (!row || row.width !== width) row = ctx.createImageData(width, 1)
      for (let x = 0; x < width; x++) {
        const o = Math.round(level[x] * 255) * 3
        row.data[x * 4] = lut[o]
        row.data[x * 4 + 1] = lut[o + 1]
        row.data[x * 4 + 2] = lut[o + 2]
        row.data[x * 4 + 3] = 255
      }
      for (let r = 0; r < speed; r++) ctx.putImageData(row, 0, top + r)
      if (top > 0) {
        ctx.fillStyle = 'rgb(0,0,0)'
        ctx.fillRect(0, 0, width, top)
        ctx.beginPath()
        for (let x = 0; x < width; x++) {
          const y = top - 2 - level[x] * (top - 6)
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        const o = 200 * 3
        ctx.strokeStyle = `rgb(${lut[o]},${lut[o + 1]},${lut[o + 2]})`
        ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1)
        ctx.stroke()
      }
    })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [receiver])

  const set = <K extends keyof View>(key: K, value: View[K]) => setView((current) => ({ ...current, [key]: value }))

  return (
    <section aria-labelledby="digi-waterfall" className="flex min-h-40 min-w-0 flex-col bg-panel-deep">
      <div className="flex items-center gap-2 bg-navy px-2 py-1">
        <h2
          id="digi-waterfall"
          className="text-sm font-medium whitespace-nowrap"
          title="Clic: frecuencia de RX · Mayús + clic: tono de TX"
        >
          Cascada
        </h2>
        <span className="ml-auto font-mono text-xs whitespace-nowrap text-rx">RX {rxHz}</span>
        <span data-testid="digi-tone" className="font-mono text-xs whitespace-nowrap text-error">
          TX {toneHz} Hz
        </span>
        <button
          type="button"
          aria-expanded={view.controls}
          aria-controls="digi-waterfall-controls"
          className="px-1 text-xs whitespace-nowrap text-muted hover:text-fg"
          onClick={() => set('controls', !view.controls)}
        >
          {view.controls ? 'Ocultar ajustes' : 'Ajustes'}
        </button>
      </div>
      <div className="relative min-h-28 flex-1 bg-instrument">
        <canvas ref={canvasRef} data-testid="digi-waterfall-canvas" aria-hidden className="absolute inset-0 h-full w-full" />
        {AXIS_HZ.map((hz) => (
          <span
            key={hz}
            aria-hidden
            className="pointer-events-none absolute top-0 h-full border-l border-white/10 pl-1 text-[10px] text-freq-label"
            style={{ left: `${(hz / MAX_HZ) * 100}%` }}
          >
            {(hz / 1_000).toFixed(1)}k
          </span>
        ))}
        {/* Ancho de una señal FT8 (50 Hz) a partir de cada marcador, como en WSJT-X. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-full border-x-2 border-rx/80"
          style={{ left: `${(rxHz / MAX_HZ) * 100}%`, width: `${(50 / MAX_HZ) * 100}%` }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-full border-l-2 border-dashed border-tx"
          style={{ left: `${(toneHz / MAX_HZ) * 100}%` }}
        />
        <button
          type="button"
          aria-label={`Cascada: clic fija RX (ahora ${rxHz} Hz), Mayús + clic fija TX (ahora ${toneHz} Hz)`}
          className="absolute inset-0 cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-slice focus-visible:ring-inset"
          onClick={(event) => {
            const ratio = event.nativeEvent.offsetX / event.currentTarget.clientWidth
            const hz = Math.round((ratio * MAX_HZ) / 10) * 10
            if (event.shiftKey) operator.setTxHz(hz)
            else operator.setRxHz(Math.min(MAX_HZ - 50, Math.max(0, hz)))
          }}
        />
      </div>
      <div className="flex flex-col gap-1 px-2 py-1.5">
        <LevelMeter label="RX" read={() => receiver.input()?.levelDb() ?? -120} />
        <LevelMeter label="TX" read={() => transmitter.levelDb()} />
      </div>
      <div
        id="digi-waterfall-controls"
        hidden={!view.controls}
        className="grid grid-cols-2 gap-x-3 gap-y-1 px-2 pb-2 sm:grid-cols-3"
      >
        <Field label="Paleta">
          <Select value={view.palette} onChange={(event) => set('palette', event.target.value)}>
            {Object.keys(WATERFALL_PALETTES).map((key) => (
              <option key={key} value={key}>
                {PALETTE_NAMES[key] ?? key}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Espectro">
          <Button
            variant={view.spectrum ? 'navy' : 'tile'}
            aria-pressed={view.spectrum}
            className="h-8"
            onClick={() => set('spectrum', !view.spectrum)}
          >
            {view.spectrum ? 'Visible' : 'Oculto'}
          </Button>
        </Field>
        <Field label="Velocidad" hint={`×${view.speed}`}>
          <Range min={1} max={4} step={1} value={view.speed} onChange={(event) => set('speed', Number(event.target.value))} />
        </Field>
        <Field label="Brillo" hint={view.brightness.toFixed(1)}>
          <Range
            min={0.5}
            max={3}
            step={0.1}
            value={view.brightness}
            onChange={(event) => set('brightness', Number(event.target.value))}
          />
        </Field>
        <Field label="Contraste" hint={view.contrast.toFixed(1)}>
          <Range
            min={0.5}
            max={4}
            step={0.1}
            value={view.contrast}
            onChange={(event) => set('contrast', Number(event.target.value))}
          />
        </Field>
        <Field label="Suelo de ruido" hint={view.floor.toFixed(2)}>
          <Range
            min={0}
            max={0.6}
            step={0.01}
            value={view.floor}
            onChange={(event) => set('floor', Number(event.target.value))}
          />
        </Field>
      </div>
    </section>
  )
}
