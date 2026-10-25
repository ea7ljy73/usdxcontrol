import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react'
import { cn } from '@/lib/cn'
import { MAX_FREQUENCY_HZ, MIN_FREQUENCY_HZ, formatFrequency } from '../domain/frequency'

const SLOTS = [10_000_000, 1_000_000, 100_000, 10_000, 1_000, 100, 10, 1]
const GROUP_AFTER = new Set([1, 4])
const PLACE_NAMES = ['decenas de MHz', 'MHz', 'centenas de kHz', 'decenas de kHz', 'kHz', 'centenas de Hz', 'decenas de Hz', 'Hz']

type Props = {
  hz: number
  onPreview: (hz: number) => void
  onCommit: (hz: number) => void
  onCancel: () => void
}

const toDigits = (hz: number) => {
  const value = Math.min(Math.max(hz, MIN_FREQUENCY_HZ), MAX_FREQUENCY_HZ)
  return String(value).padStart(SLOTS.length, '0').split('').map(Number)
}

export function FrequencyEditor({ hz, onPreview, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(() => Math.min(Math.max(hz, MIN_FREQUENCY_HZ), MAX_FREQUENCY_HZ))
  const [selected, setSelected] = useState(1)
  const ref = useRef<HTMLDivElement | null>(null)
  const digits = toDigits(value)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const focusEditor = () => ref.current?.focus()

  const frequenciesOf = (changed: number[]) =>
    changed.reduce((acc, digit, index) => acc + digit * SLOTS[index], 0)

  const inRange = (candidate: number) => candidate >= MIN_FREQUENCY_HZ && candidate <= MAX_FREQUENCY_HZ

  const adjust = (slot: number, delta: 1 | -1) => {
    const next = [...digits]
    next[slot] = (next[slot] + delta + 10) % 10
    const changed = frequenciesOf(next)
    if (!inRange(changed)) return
    setValue(changed)
    onPreview(changed)
  }

  const typeDigit = (slot: number, digit: number) => {
    const next = [...digits]
    next[slot] = digit
    const changed = frequenciesOf(next)
    if (!inRange(changed)) return
    setValue(changed)
    onPreview(changed)
    setSelected(Math.min(slot + 1, SLOTS.length - 1))
  }

  const commit = () => onCommit(value)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key >= '0' && event.key <= '9') {
      typeDigit(selected, Number(event.key))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      adjust(selected, 1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      adjust(selected, -1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSelected((current) => Math.max(current - 1, 0))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setSelected((current) => Math.min(current + 1, SLOTS.length - 1))
    } else if (event.key === 'Enter') {
      commit()
    } else if (event.key === 'Escape') {
      onCancel()
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      typeDigit(selected, 0)
    }
  }

  return (
    <div
      ref={ref}
      data-testid="freq-editor"
      role="group"
      tabIndex={0}
      aria-label={`Editor de frecuencia por dígitos, ${formatFrequency(value)} hercios, rueda o flechas arriba y abajo para variar el dígito elegido, Enter para confirmar, Escape para cancelar`}
      onKeyDown={onKeyDown}
      className="flex items-center justify-center gap-0.5 rounded-lg border border-accent bg-bg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {digits.map((digit, slot) => (
        <span key={slot} className="flex items-center">
          <span
            data-testid={`freq-digit-${slot}`}
            title={`Dígito ${PLACE_NAMES[slot]} · rueda, ↑/↓ o teclea un número`}
            onWheel={(event: WheelEvent<HTMLSpanElement>) => adjust(slot, event.deltaY < 0 ? 1 : -1)}
            onClick={() => {
              setSelected(slot)
              focusEditor()
            }}
            className={cn(
              'w-6 cursor-ns-resize rounded-md text-center font-mono text-4xl font-semibold tracking-widest outline-none',
              slot === selected ? 'bg-accent/15 text-accent ring-1 ring-accent' : 'hover:bg-accent/10',
              digit === 0 && slot !== selected ? 'text-muted/40' : slot === selected ? 'text-accent' : 'text-fg',
            )}
          >
            {digit}
          </span>
          {GROUP_AFTER.has(slot) ? <span className="text-3xl font-semibold text-muted/60">.</span> : null}
        </span>
      ))}
      <span data-testid="freq-editor-value" className="sr-only" aria-live="polite">
        {formatFrequency(value)}
      </span>
    </div>
  )
}
