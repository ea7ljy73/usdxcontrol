import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'navy' | 'tile' | 'pill' | 'tx' | 'ghost'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}

const variants = {
  navy: 'bg-navy text-fg hover:bg-navy-hover',
  tile: 'bg-tile text-fg hover:bg-tile-hover',
  pill: 'bg-fg px-4 py-1 text-bg hover:bg-muted',
  // Transmitir manda sobre el acento de seleccionado: siempre rojo.
  tx: 'bg-tx text-tx-fg aria-pressed:bg-tx aria-pressed:text-tx-fg aria-pressed:hover:bg-tx',
  ghost: 'text-muted hover:bg-white/10 hover:text-fg',
} as const

export function Button({ variant = 'navy', className, ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center justify-center rounded px-3 py-2 text-sm font-medium transition-colors duration-150 outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-slice focus-visible:ring-inset',
        // Lo seleccionado se reconoce igual en toda la app: acento.
        'aria-pressed:bg-accent aria-pressed:text-accent-fg aria-pressed:hover:bg-accent',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        className,
      )}
    />
  )
}
