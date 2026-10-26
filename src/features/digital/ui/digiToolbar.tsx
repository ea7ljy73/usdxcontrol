import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { CLOCK_TOLERANCE_MS, measureOffset } from '../application/digiClock'
import { digiDialHz } from '../domain/digiFrequencies'
import { DIGI_MODES, slotIndex, slotLengthMs, slotParity, slotProgress, slotStartMs, type DigiMode } from '../domain/slots'
import { useDigital, useUtcNow } from './useDigital'

const DIGI_BANDS = ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m']

type Props = {
  dialHz: number | null
  onMode: (mode: DigiMode) => void
  onTune: (hz: number) => void
  onOpenDialog: (dialog: 'audio' | 'map' | 'logbook' | 'settings') => void
}

const two = (value: number) => String(value).padStart(2, '0')

// Barra superior de la pantalla FT8: modo, bandas, audio, ventanas y reloj UTC del ciclo.
export function DigiToolbar({ dialHz, onMode, onTune, onOpenDialog }: Props) {
  const { receiver, receiverState, operator, operatorState, clock, utcSource } = useDigital()
  const now = useUtcNow()
  const [offset, setOffset] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const mode = receiverState.mode
  const date = new Date(now)
  const index = slotIndex(now, mode)
  const myTurn = slotParity(index) === operatorState.settings.txParity
  const startSec = (slotStartMs(index, mode) % 60_000) / 1_000
  const slotLabel = `${startSec.toFixed(mode === 'FT4' ? 1 : 0)}–${(startSec + slotLengthMs(mode) / 1_000).toFixed(mode === 'FT4' ? 1 : 0)} s`
  const running = receiverState.status === 'on'

  const sync = async () => {
    setSyncing(true)
    try {
      const sent = Date.now()
      const server = await utcSource.fetchUtcMs()
      const measured = measureOffset(server, sent, Date.now())
      clock.setOffset(measured)
      setOffset(measured)
      operator.notify(
        Math.abs(measured) <= CLOCK_TOLERANCE_MS
          ? `Reloj en hora (${measured >= 0 ? '+' : ''}${measured} ms), corregido`
          : `El reloj iba ${(measured / 1_000).toFixed(1)} s desviado: corregido para FT8; ajusta la hora del sistema`,
        Math.abs(measured) <= CLOCK_TOLERANCE_MS ? 'success' : 'error',
      )
    } catch (error) {
      operator.notify(error instanceof Error ? error.message : 'No se pudo consultar la hora UTC', 'error')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-panel-deep px-2 py-1.5">
      <div role="group" aria-label="Modo digital" className="flex gap-px">
        {DIGI_MODES.map((entry) => (
          <Button
            key={entry}
            variant={mode === entry ? 'navy' : 'tile'}
            aria-pressed={mode === entry}
            className="h-8 px-3"
            onClick={() => onMode(entry)}
          >
            {entry}
          </Button>
        ))}
      </div>

      <div role="group" aria-label={`Bandas ${mode}`} className="flex flex-wrap gap-px">
        {DIGI_BANDS.map((band) => {
          const hz = digiDialHz(mode, band)
          if (hz === null) return null
          const active = dialHz === hz
          return (
            <Button
              key={band}
              variant={active ? 'navy' : 'tile'}
              aria-pressed={active}
              aria-label={`${band} ${mode}, ${(hz / 1e6).toFixed(3)} MHz`}
              title={`${(hz / 1e6).toFixed(4)} MHz`}
              className="h-8 px-1.5 text-xs"
              onClick={() => onTune(hz)}
            >
              {band}
            </Button>
          )
        })}
      </div>

      <div role="group" aria-label="Audio de recepción" className="flex gap-px">
        <Button
          variant={running ? 'navy' : 'tile'}
          aria-pressed={running}
          className="h-8 px-2 text-xs"
          onClick={() => void receiver.start()}
        >
          ▶ Escuchar
        </Button>
        <Button
          variant={receiverState.status === 'paused' ? 'navy' : 'tile'}
          aria-pressed={receiverState.status === 'paused'}
          disabled={!running && receiverState.status !== 'paused'}
          className="h-8 px-2 text-xs"
          onClick={() => (receiverState.status === 'paused' ? void receiver.start() : receiver.pause())}
        >
          ❚❚ Pausa
        </Button>
        <Button
          variant="tile"
          disabled={receiverState.status === 'off'}
          className="h-8 px-2 text-xs"
          onClick={() => {
            operator.haltTx()
            receiver.stop()
          }}
        >
          ■ Parar
        </Button>
      </div>

      <div className="flex gap-px">
        <Button variant="tile" className="h-8 px-2 text-xs" onClick={() => onOpenDialog('settings')}>
          Ajustes…
        </Button>
        <Button variant="tile" className="h-8 px-2 text-xs" onClick={() => onOpenDialog('audio')}>
          Audio…
        </Button>
        <Button variant="tile" className="h-8 px-2 text-xs" onClick={() => onOpenDialog('map')}>
          Mapa
        </Button>
        <Button variant="tile" className="h-8 px-2 text-xs" onClick={() => onOpenDialog('logbook')}>
          Libro ({operatorState.logbook.length})
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span data-testid="digi-utc" className="font-mono text-base text-fg tabular-nums">
              {two(date.getUTCHours())}:{two(date.getUTCMinutes())}:{two(date.getUTCSeconds())}Z
            </span>
            <span
              data-testid="digi-turn"
              className={cn('px-1.5 font-mono text-xs', myTurn ? 'bg-instrument text-error' : 'bg-instrument text-rx')}
            >
              {myTurn ? 'TX' : 'RX'} · {slotLabel}
            </span>
          </span>
          <span aria-hidden className="relative h-1 bg-instrument">
            <span
              className={cn('absolute inset-y-0 left-0', myTurn ? 'bg-tx' : 'bg-rx')}
              style={{ width: `${slotProgress(now, mode) * 100}%` }}
            />
          </span>
        </div>
        <Button
          variant="tile"
          className="h-8 px-2 text-xs"
          disabled={syncing}
          title="Compara el reloj con un servidor de hora y corrige el desfase (FT8 necesita ±1 s)"
          onClick={() => void sync()}
        >
          {syncing ? 'Sincronizando…' : 'Sincronizar hora'}
        </Button>
        {offset !== null && (
          <span
            data-testid="digi-clock-offset"
            className={cn('font-mono text-xs', Math.abs(offset) <= CLOCK_TOLERANCE_MS ? 'text-rx' : 'text-error')}
          >
            {offset >= 0 ? '+' : ''}
            {offset} ms
          </span>
        )}
      </div>
    </div>
  )
}
