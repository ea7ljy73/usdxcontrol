import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

// Vúmetro horizontal: -60 dBFS a 0 dBFS, verde, ámbar por encima de -20 y rojo cerca del recorte.
export function LevelMeter({ label, read, className }: { label: string; read: () => number; className?: string }) {
  const barRef = useRef<HTMLSpanElement | null>(null)
  const readRef = useRef(read)

  useEffect(() => {
    readRef.current = read
  }, [read])

  useEffect(() => {
    let smooth = 0
    let frame = requestAnimationFrame(function loop() {
      const percent = Math.max(0, Math.min(100, ((readRef.current() + 60) / 60) * 100))
      smooth = smooth * 0.75 + percent * 0.25
      const bar = barRef.current
      if (bar) {
        bar.style.width = `${smooth.toFixed(1)}%`
        bar.dataset.level = smooth > 85 ? 'high' : smooth > 66 ? 'mid' : 'low'
      }
      frame = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <span className={cn('flex items-center gap-2 text-xs text-muted', className)}>
      <span className="w-6 shrink-0">{label}</span>
      <span aria-hidden className="relative h-1.5 min-w-10 flex-1 bg-instrument">
        <span ref={barRef} className="absolute inset-y-0 left-0 bg-rx data-[level=high]:bg-tx data-[level=mid]:bg-slice" />
      </span>
    </span>
  )
}
