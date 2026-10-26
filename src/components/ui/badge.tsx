import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'muted' | 'ok' | 'alert'

const tones = {
  muted: 'text-muted',
  ok: 'text-rx',
  alert: 'text-tx',
} as const

type Props = ComponentProps<'span'> & { tone?: Tone; children: ReactNode }

export function Badge({ tone = 'muted', className, ...props }: Props) {
  return (
    <span
      {...props}
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium', tones[tone], className)}
    />
  )
}
