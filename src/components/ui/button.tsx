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
  pill: 'rounded-md bg-fg px-4 py-1 text-navy hover:bg-muted',
  tx: 'bg-tx text-tx-fg',
  ghost: 'text-muted hover:bg-white/10 hover:text-fg',
} as const

export function Button({ variant = 'navy', className, ...props }: Props) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center justify-center px-3 py-2 text-sm font-medium transition-colors duration-150 outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-slice focus-visible:ring-inset',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        className,
      )}
    />
  )
}
