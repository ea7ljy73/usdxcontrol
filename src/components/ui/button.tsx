import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'default' | 'ghost' | 'primary' | 'tx'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}

const variants = {
  default: 'border border-line bg-panel text-fg hover:border-accent hover:text-accent',
  ghost: 'text-muted hover:bg-line hover:text-fg',
  primary: 'border border-transparent bg-accent text-accent-fg hover:opacity-90',
  tx: 'border border-transparent bg-tx text-on-tx hover:opacity-90',
} as const

export function Button({ variant = 'default', className, ...props }: Props) {
  return (
    <button
      {...props}
      className={cn(
        'rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        className,
      )}
    />
  )
}
