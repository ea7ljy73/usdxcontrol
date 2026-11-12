import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Range, Select, TextInput } from '@/components/ui/field'
import type { DirectSamplingMode, SdrSource } from '../application/ports'
import { SDR_SAMPLE_RATES } from '../domain/sdrTuning'
import { useSdr } from './useSdr'
import { useI18n } from '@/i18n/useI18n'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const SOURCES: SdrSource[] = ['usb', 'tcp']
const DIRECT: DirectSamplingMode[] = ['q', 'i', 'off']

// Ajustes y conexión del SDR que da el espectro de RF al panadaptador.
export function SdrDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n()
  const { sdr, sdrState } = useSdr()
  const { settings, status, available } = sdrState
  const active = status === 'on' || status === 'muted' || status === 'connecting'

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('sdr.title')}
      description={t('sdr.description')}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('sdr.connection')} className="col-span-2">
          <Select
            value={settings.source}
            disabled={active}
            onChange={(event) => void sdr.updateSettings({ source: event.target.value as SdrSource })}
          >
            {SOURCES.map((source) => (
              <option key={source} value={source} disabled={!available.includes(source)}>
                {t(`sdr.source.${source}`)}
                {available.includes(source) ? '' : source === 'tcp' ? t('sdr.desktopOnly') : t('sdr.noWebUsb')}
              </option>
            ))}
          </Select>
        </Field>
        {settings.source === 'tcp' && (
          <>
            <Field label={t('sdr.tcpHost')}>
              <TextInput
                disabled={active}
                value={settings.host}
                onChange={(event) => void sdr.updateSettings({ host: event.target.value.trim() })}
              />
            </Field>
            <Field label={t('sdr.port')}>
              <TextInput
                inputMode="numeric"
                disabled={active}
                value={String(settings.port)}
                onChange={(event) => void sdr.updateSettings({ port: Number(event.target.value.replace(/\D/g, '')) || 0 })}
              />
            </Field>
          </>
        )}
        <Field label={t('sdr.directSampling')} className="col-span-2">
          <Select
            value={settings.directSampling}
            onChange={(event) => void sdr.updateSettings({ directSampling: event.target.value as DirectSamplingMode })}
          >
            {DIRECT.map((mode) => (
              <option key={mode} value={mode}>
                {t(`sdr.direct.${mode}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('sdr.sampleRate')}>
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
        <Field label={t('sdr.correction')} hint="ppm">
          <TextInput
            inputMode="numeric"
            value={String(settings.ppm)}
            onChange={(event) => {
              const ppm = Number.parseInt(event.target.value, 10)
              void sdr.updateSettings({ ppm: Number.isFinite(ppm) ? Math.max(-200, Math.min(200, ppm)) : 0 })
            }}
          />
        </Field>
        <Field label={t('sdr.gain')} hint={settings.gainDb === null ? t('sdr.gainAuto') : `${settings.gainDb.toFixed(1)} dB`}>
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
              aria-label={t('sdr.gainAria')}
              disabled={settings.gainDb === null}
              value={settings.gainDb ?? 30}
              onChange={(event) => void sdr.updateSettings({ gainDb: Number(event.target.value) })}
            />
          </span>
        </Field>
        <Field label="Upconverter" hint={t('sdr.upconverterHint')}>
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
          {t('sdr.muteOnTx')}
        </label>
        <p className="col-span-2 text-xs text-muted">{t('sdr.muteOnTxHelp')}</p>
        <div className="col-span-2 flex items-center gap-3">
          <span
            data-testid="sdr-status"
            role="status"
            className={status === 'error' ? 'text-sm text-error select-text' : status === 'on' ? 'text-sm text-rx' : 'text-sm text-muted'}
          >
            {status === 'error' ? (sdrState.lastError ?? t('sdr.status.error')) : t(`sdr.status.${status}`)}
            {sdrState.centerHz !== null && status !== 'error' ? ` · ${(sdrState.centerHz / 1e6).toFixed(3)} MHz` : ''}
          </span>
          <Button
            variant={active ? 'tile' : 'navy'}
            className="ml-auto h-8 text-xs"
            disabled={status === 'connecting' || available.length === 0}
            onClick={() => void (active ? sdr.disconnect() : sdr.connect())}
          >
            {active ? t('sdr.disconnect') : t('sdr.connect')}

          </Button>
        </div>
      </div>
    </Dialog>
  )
}
