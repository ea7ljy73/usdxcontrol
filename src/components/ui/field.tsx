import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const control =
  'h-8 w-full min-w-0 border border-navy-line bg-instrument px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-slice disabled:opacity-40'

// Campo con etiqueta encima, en el estilo de los paneles.
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-0.5 text-xs text-muted', className)}>
      <span className="flex items-baseline justify-between gap-2">
        {label}
        {hint && <span className="truncate text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={cn(control, className)} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, 'bg-navy', className)} />
}

export function Range({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="range" {...props} className={cn('w-full accent-meter', className)} />
}
