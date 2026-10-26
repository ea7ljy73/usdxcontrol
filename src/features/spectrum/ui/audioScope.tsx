import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import type { SpectrumFeed } from '../application/ports'
import { AUDIO_LIMIT_HZ } from '../domain/audioMapping'
import { frameColumns } from '../domain/columns'
import { paletteCurve, paletteGrid, SPECTRUM_FILL } from '../domain/palette'

const DB_MIN = -110
const DB_MAX = -20
const AXIS_KHZ = [0, 1, 2, 3, 4]
// Vista "plana" de audio: el desplazamiento de cada columna es directamente su frecuencia de audio.
const AUDIO_AXIS = { leftHz: 0, spanHz: AUDIO_LIMIT_HZ, vfoHz: 0, audio: { sideband: 'upper', pivotHz: 0 } } as const

type Props = {
  feed: SpectrumFeed | null
  passbandAudioHz: [number, number] | null
}

export function AudioScope({ feed, passbandAudioHz }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(8, Math.round(canvas.clientHeight * dpr))
    }
    const paint = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = paletteGrid
      ctx.lineWidth = 1
      for (const khz of AXIS_KHZ.slice(1, -1)) {
        const x = Math.round((khz * 1_000 * width) / AUDIO_LIMIT_HZ) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      const frame = feed?.read()
      if (!frame || frame.kind !== 'audio') return
      const levels = frameColumns(frame, AUDIO_AXIS, width)
      const area = new Path2D()
      const trace = new Path2D()
      area.moveTo(0, height)
      for (let x = 0; x < width; x++) {
        const db = Number.isFinite(levels[x]) ? levels[x] : DB_MIN
        const t = Math.min(1, Math.max(0, (db - DB_MIN) / (DB_MAX - DB_MIN)))
        const y = height - 1 - t * (height - 1)
        area.lineTo(x, y)
        if (x === 0) trace.moveTo(x, y)
        else trace.lineTo(x, y)
      }
      area.lineTo(width, height)
      area.closePath()
      const gradient = ctx.createLinearGradient(0, height, 0, 0)
      SPECTRUM_FILL.forEach(([at, color]) => gradient.addColorStop(at, color))
      ctx.fillStyle = gradient
      ctx.fill(area)
      ctx.strokeStyle = paletteCurve
      ctx.stroke(trace)
    }
    fit()
    paint()
    const observer = new ResizeObserver(() => {
      fit()
      paint()
    })
    observer.observe(canvas)
    if (feed === null) return () => observer.disconnect()
    let frame = requestAnimationFrame(function loop() {
      paint()
      frame = requestAnimationFrame(loop)
    })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [feed])

  return (
    <div>
      <div className="relative h-16">
        {passbandAudioHz && (
          <div
            aria-hidden
            className="absolute inset-y-0 bg-filter"
            style={{
              left: `${(passbandAudioHz[0] / AUDIO_LIMIT_HZ) * 100}%`,
              right: `${(1 - passbandAudioHz[1] / AUDIO_LIMIT_HZ) * 100}%`,
            }}
          />
        )}
        <canvas ref={canvasRef} data-testid="audio-scope" aria-hidden className="absolute inset-0 h-full w-full" />
        {feed === null && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">
            Pulsa AUDIO para ver el espectro
          </span>
        )}
      </div>
      <div aria-hidden className="relative mt-1 h-4 text-xs text-fg tabular-nums">
        {AXIS_KHZ.map((khz, index) => (
          <span
            key={khz}
            className={cn(
              'absolute',
              index === AXIS_KHZ.length - 1 ? '-translate-x-full' : index > 0 && '-translate-x-1/2',
            )}
            style={{ left: `${(khz * 1_000 * 100) / AUDIO_LIMIT_HZ}%` }}
          >
            {khz === 0 ? '0' : `${khz}k`}
          </span>
        ))}
      </div>
    </div>
  )
}
