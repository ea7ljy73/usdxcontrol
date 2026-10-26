import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { SdrDialog } from './sdrDialog'
import { useSdr } from './useSdr'

// Botón de la cabecera: estado del SDR y acceso a su ventana.
export function SdrButton() {
  const { sdrState } = useSdr()
  const [open, setOpen] = useState(false)
  const { status } = sdrState
  return (
    <>
      <Button
        data-testid="sdr-button"
        variant="navy"
        className="h-7 gap-1.5 rounded-md px-3 text-xs"
        aria-label={`SDR: ${status === 'on' ? 'recibiendo' : status === 'muted' ? 'en pausa por TX' : status === 'error' ? 'error' : 'desconectado'}`}
        onClick={() => setOpen(true)}
      >
        <span
          aria-hidden
          className={cn(
            'size-2 rounded-full',
            status === 'on' ? 'bg-rx' : status === 'muted' ? 'bg-tx' : status === 'error' ? 'bg-error' : 'bg-dim',
          )}
        />
        SDR
      </Button>
      <SdrDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
