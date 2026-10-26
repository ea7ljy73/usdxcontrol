import type { ReactNode } from 'react'
import { Dialog as RadixDialog } from 'radix-ui'
import { cn } from '@/lib/cn'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}

// Ventana modal con la cabecera azul de los paneles de SmartSDR.
export function Dialog({ open, onOpenChange, title, description, children, className }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <RadixDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[90svh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col border border-navy-line bg-panel-deep text-fg outline-none',
            className,
          )}
        >
          <div className="flex items-center justify-between bg-navy px-3 py-1.5">
            <RadixDialog.Title className="text-sm font-medium">{title}</RadixDialog.Title>
            <RadixDialog.Close
              aria-label="Cerrar"
              className="px-2 text-lg leading-none text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-slice"
            >
              ×
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="px-3 pt-2 text-xs text-muted">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
