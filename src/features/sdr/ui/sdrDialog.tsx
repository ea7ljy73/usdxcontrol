import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Range, Select, TextInput } from '@/components/ui/field'
import type { DirectSamplingMode, SdrSource } from '../application/ports'
import { SDR_SAMPLE_RATES } from '../domain/sdrTuning'
import { useSdr } from './useSdr'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const SOURCES: Record<SdrSource, string> = {
  usb: 'USB directo (RTL-SDR)',
  tcp: 'Red · rtl_tcp',
}

const DIRECT: Record<DirectSamplingMode, string> = {
  q: 'Rama Q · HF en V3 y clones (HTOOL…)',
  i: 'Rama I',
  off: 'Desactivado · V4 o upconverter',
}

const STATUS = {
  off: 'Desconectado',
  connecting: 'Conectando…',
  on: 'Recibiendo',
  muted: 'En pausa: el uSDX transmite',
  error: 'Error',
} as const

// Ajustes y conexión del SDR que da el espectro de RF al panadaptador.
export function SdrDialog({ open, onOpenChange }: Props) {
  const { sdr, sdrState } = useSdr()
  const { settings, status, available } = sdrState
  const active = status === 'on' || status === 'muted' || status === 'connecting'

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Receptor SDR"
      description="Un RTL-SDR da el espectro completo de la banda; transmitir lo sigue haciendo el uSDX."
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Conexión" className="col-span-2">
          <Select
            value={settings.source}
            disabled={active}
            onChange={(event) => void sdr.updateSettings({ source: event.target.value as SdrSource })}
          >
            {(Object.keys(SOURCES) as SdrSource[]).map((source) => (
              <option key={source} value={source} disabled={!available.includes(source)}>
                {SOURCES[source]}
                {available.includes(source) ? '' : source === 'tcp' ? ' (solo en la app de escritorio)' : ' (este navegador no tiene WebUSB)'}
              </option>
            ))}
          </Select>
        </Field>
        {settings.source === 'tcp' && (
          <>
            <Field label="Servidor rtl_tcp">
              <TextInput
                disabled={active}
                value={settings.host}
                onChange={(event) => void sdr.updateSettings({ host: event.target.value.trim() })}
              />
            </Field>
            <Field label="Puerto">
              <TextInput
                inputMode="numeric"
                disabled={active}
                value={String(settings.port)}
                onChange={(event) => void sdr.updateSettings({ port: Number(event.target.value.replace(/\D/g, '')) || 0 })}
              />
            </Field>
          </>
        )}
        <Field label="Muestreo directo (HF)" className="col-span-2">
          <Select
            value={settings.directSampling}
            onChange={(event) => void sdr.updateSettings({ directSampling: event.target.value as DirectSamplingMode })}
          >
            {(Object.keys(DIRECT) as DirectSamplingMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {DIRECT[mode]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ancho de muestreo">
          <Select
            value={String(settings.sampleRate)}
            onChange={(event) => void sdr.updateSettings({ sampleRate: Number(event.target.value) })}
          >
            {SDR_SAMPLE_RATES.map((rate) => (
              <option key={rate} value={String(rate)}>
                {(rate / 1e6).toFixed(3)} MS/s
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Corrección" hint="ppm">
          <TextInput
            inputMode="numeric"
            value={String(settings.ppm)}
            onChange={(event) => {
              const ppm = Number.parseInt(event.target.value, 10)
              void sdr.updateSettings({ ppm: Number.isFinite(ppm) ? Math.max(-200, Math.min(200, ppm)) : 0 })
            }}
          />
        </Field>
        <Field label="Ganancia" hint={settings.gainDb === null ? 'automática' : `${settings.gainDb.toFixed(1)} dB`}>
          <span className="flex items-center gap-2">
            <Button
              variant={settings.gainDb === null ? 'navy' : 'tile'}
              aria-pressed={settings.gainDb === null}
              className="h-8 px-2 text-xs"
              onClick={() => void sdr.updateSettings({ gainDb: settings.gainDb === null ? 30 : null })}
            >
              Auto
            </Button>
            <Range
              min={0}
              max={49.6}
              step={0.1}
              aria-label="Ganancia del SDR"
              disabled={settings.gainDb === null}
              value={settings.gainDb ?? 30}
              onChange={(event) => void sdr.updateSettings({ gainDb: Number(event.target.value) })}
            />
          </span>
        </Field>
        <Field label="Upconverter" hint="Hz, 0 = sin él">
          <TextInput
            inputMode="numeric"
            value={String(settings.upconverterHz)}
            onChange={(event) => void sdr.updateSettings({ upconverterHz: Number(event.target.value.replace(/\D/g, '')) || 0 })}
          />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-meter"
            checked={settings.muteOnTx}
            onChange={(event) => void sdr.updateSettings({ muteOnTx: event.target.checked })}
          />
          Dejar de recibir mientras transmite el uSDX (recomendado)
        </label>
        <p className="col-span-2 text-xs text-muted">
          En TX la ganancia del SDR baja al mínimo y se deja de pintar el espectro. Si la antena del SDR está cerca de la
          del uSDX, protégelo además con un conmutador o un limitador.
        </p>
        <div className="col-span-2 flex items-center gap-3">
          <span
            data-testid="sdr-status"
            role="status"
            className={status === 'error' ? 'text-sm text-error' : status === 'on' ? 'text-sm text-rx' : 'text-sm text-muted'}
          >
            {status === 'error' ? (sdrState.lastError ?? STATUS.error) : STATUS[status]}
            {sdrState.centerHz !== null && status !== 'error' ? ` · ${(sdrState.centerHz / 1e6).toFixed(3)} MHz` : ''}
          </span>
          <Button
            variant={active ? 'tile' : 'navy'}
            className="ml-auto h-8 text-xs"
            disabled={status === 'connecting' || available.length === 0}
            onClick={() => void (active ? sdr.disconnect() : sdr.connect())}
          >
            {active ? 'Desconectar SDR' : 'Conectar SDR'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
