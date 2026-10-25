import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'muted' | 'ok' | 'alert'

const tones = {
  muted: 'border-line text-muted',
  ok: 'border-rx text-rx',
  alert: 'border-tx text-tx',
} as const

type Props = ComponentProps<'span'> & { tone?: Tone; children: ReactNode }

export function Badge({ tone = 'muted', className, ...props }: Props) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
    />
  )
}
