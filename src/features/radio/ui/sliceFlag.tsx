import { cn } from '@/lib/cn'
import type { RadioMode } from '../domain/mode'
import { passbandWidthLabel } from '../domain/passband'
import { AGC_LEVELS, meterForS, meterPercent, meterRatio, sUnitLabel } from '../domain/receiver'

// Marcas sobre la escala del S-meter del CAT (0..30, S9 = 15, 4 dB por cuenta).
const S9_RATIO = meterRatio(meterForS(9))
const SCALE_MARKS = [
  { label: '1', at: meterRatio(meterForS(1)) },
  { label: '3', at: meterRatio(meterForS(3)) },
  { label: '5', at: meterRatio(meterForS(5)) },
  { label: '7', at: meterRatio(meterForS(7)) },
  { label: '9', at: S9_RATIO },
  { label: '+20', at: meterRatio(meterForS(9, 20)) },
  { label: '+40', at: meterRatio(meterForS(9, 40)) },
]

export function SMeterScale({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const large = size === 'lg'
  return (
    <div aria-hidden className={cn('relative', large ? 'h-8' : 'h-6')}>
      <div className="absolute inset-x-0 top-0 flex h-0.5">
        <span className="bg-meter" style={{ width: `${S9_RATIO * 100}%` }} />
        <span className="flex-1 bg-tx" />
      </div>
      {SCALE_MARKS.map((mark) => (
        <span
          key={mark.label}
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${mark.at * 100}%` }}
        >
          <span className={cn('w-0.5', large ? 'h-2.5' : 'h-2', mark.at > S9_RATIO ? 'bg-tx' : 'bg-meter')} />
          <span className={cn('leading-none text-fg tabular-nums', large ? 'mt-1 text-sm' : 'mt-0.5 text-[11px]')}>
            {mark.label}
          </span>
        </span>
      ))}
    </div>
  )
}

type Props = {
  frequencyLabel: string
  tag: string
  mode: RadioMode | null
  tx: boolean
  meter: number | null
  nr: number | null
  agc: number | null
  bandLabel: string | null
  // Sin firmware ampliado NR y AGC solo se muestran.
  controlsEnabled?: boolean
  onNrClick?: () => void
  onAgcClick?: () => void
}

const AGC_SHORT = ['OFF', 'F', 'S'] as const
const flagButton =
  'pointer-events-auto px-1 leading-5 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-slice focus-visible:outline-none disabled:pointer-events-none'

export function SliceFlag({
  frequencyLabel,
  tag,
  mode,
  tx,
  meter,
  nr,
  agc,
  bandLabel,
  controlsEnabled = false,
  onNrClick,
  onAgcClick,
}: Props) {
  const nrOn = (nr ?? 0) > 0
  const agcLabel = agc === null ? '--' : (AGC_SHORT[agc] ?? '--')
  return (
    <div
      data-testid="slice-flag"
      className="w-44 border border-white/10 bg-instrument/90 px-2 pt-1 pb-1.5 text-fg sm:w-60"
    >
      <div className="flex items-center gap-2 text-xs sm:text-sm">
        <span className="text-ant">ANT1</span>
        <span className="text-muted">{bandLabel ?? '—'}</span>
        <span className="text-ant">{mode ? passbandWidthLabel(mode) : ''}</span>
        <span
          className={cn(
            'ml-auto px-1 text-sm leading-5 font-bold',
            tx ? 'bg-tx text-tx-fg' : 'border border-dim text-dim',
          )}
        >
          TX
        </span>
        <span className="bg-accent px-1.5 text-sm leading-5 font-bold text-accent-fg">{tag}</span>
      </div>
      <div className="mt-0.5 flex items-end justify-between gap-2">
        <span className="pb-1 text-sm sm:text-base">{mode ?? '---'}</span>
        <span className="text-2xl leading-none font-light tabular-nums sm:text-3xl">{frequencyLabel}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-2.5 flex-1 bg-white/10">
          <div
            className="h-full bg-rx transition-[width] duration-150"
            style={{ width: `${meter === null ? 0 : meterPercent(meter)}%` }}
          />
        </div>
        <span className="w-14 text-right text-xs tabular-nums">{meter === null ? '' : sUnitLabel(meter)}</span>
      </div>
      <div className="mt-1">
        <SMeterScale />
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs font-medium sm:text-sm">
        <svg aria-hidden width="18" height="14" viewBox="0 0 18 14" className="text-ant" fill="currentColor">
          <path d="M1 5h3l4-4v12L4 9H1z" />
          <path d="M11 4a4 4 0 0 1 0 6M13 2a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <button
          type="button"
          data-testid="flag-nr"
          disabled={!controlsEnabled}
          aria-label={`${nrOn ? `NR${nr}` : 'NR'}: reducción de ruido, clic para subir`}
          onClick={onNrClick}
          className={cn(flagButton, nrOn ? 'text-ant' : 'text-dim')}
        >
          {nrOn ? `NR${nr}` : 'NR'}
        </button>
        <button
          type="button"
          data-testid="flag-agc"
          disabled={!controlsEnabled}
          aria-label={`AGC-${agcLabel}: ${agc === null ? 'desconocido' : AGC_LEVELS[agc]}, clic para cambiar`}
          onClick={onAgcClick}
          className={cn(flagButton, 'ml-auto text-ant')}
        >
          AGC-{agcLabel}
        </button>
      </div>
    </div>
  )
}
