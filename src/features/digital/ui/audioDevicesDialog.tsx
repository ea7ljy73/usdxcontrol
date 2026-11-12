import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Range, Select } from '@/components/ui/field'
import type { AudioDevice } from '../application/ports'
import { LevelMeter } from './levelMeter'
import { monitorConflict, type AudioSettings } from './useAudioSettings'
import { useDigital } from './useDigital'
import { useI18n } from '@/i18n/useI18n'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  audio: AudioSettings
  onAudioChange: (audio: AudioSettings) => void
}

// Tarjetas de sonido de la radio: entrada para decodificar y salida para transmitir.
export function AudioDevicesDialog({ open, onOpenChange, audio, onAudioChange: setAudio }: Props) {
  const { t } = useI18n()
  const { devices, receiver, transmitter } = useDigital()
  const [list, setList] = useState<{
    inputs: AudioDevice[]
    outputs: AudioDevice[]
    defaultOutput?: string
  }>({ inputs: [], outputs: [] })
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    () =>
      devices.list().then(
        (found) => {
          setList(found)
          setLoaded(true)
          setError(null)
        },
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      ),
    [devices],
  )

  useEffect(() => {
    if (!open) return
    void refresh()
    // Al enchufar o quitar una tarjeta (cable USB de la radio) la lista se actualiza sola.
    const media = navigator.mediaDevices
    const changed = () => void refresh()
    media?.addEventListener?.('devicechange', changed)
    return () => media?.removeEventListener?.('devicechange', changed)
  }, [open, refresh])

  const sameCard = audio.outputId === null && audio.monitorId === null
  // La salida de TX es lo que más falla: si va a los altavoces del PC, la radio
  // transmite con PTT pero sin señal.
  const outputMissing = loaded && audio.outputId !== null && !list.outputs.some((device) => device.id === audio.outputId)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('audio.title')}
      description={t('audio.description')}
    >
      <div className="flex flex-col gap-3">
        <Field label={t('audio.input')}>
          <Select value={audio.inputId ?? ''} onChange={(event) => setAudio({ ...audio, inputId: event.target.value || null })}>
            <option value="">{t('audio.systemDefault')}</option>
            {list.inputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('audio.inputGain')} hint={`${Math.round(audio.inputGain * 100)} %`}>
          <Range
            min={0}
            max={4}
            step={0.05}
            value={audio.inputGain}
            aria-label={t('audio.inputGain')}
            onChange={(event) => setAudio({ ...audio, inputGain: Number(event.target.value) })}
          />
        </Field>
        <LevelMeter label="RX" read={() => receiver.input()?.levelDb() ?? -120} />
        <Field label={t('audio.output')}>
          <Select value={audio.outputId ?? ''} onChange={(event) => setAudio({ ...audio, outputId: event.target.value || null })}>
            <option value="">{t('audio.systemDefault')}</option>
            {list.outputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </Select>
        </Field>
        {outputMissing && (
          <p role="alert" className="text-xs text-error">
            {t('audio.outputMissing')}
          </p>
        )}
        {audio.outputId === null && (
          <p role="alert" data-testid="digi-output-default" className="text-xs text-slice">
            {t('audio.outputDefaultWarning', { current: list.defaultOutput ? t('audio.outputDefaultNow', { device: list.defaultOutput }) : '' })}
          </p>
        )}
        <Field label={t('audio.txLevel')} hint={`${Math.round(audio.txGain * 100)} %`}>
          <Range
            min={0}
            max={1}
            step={0.01}
            value={audio.txGain}
            aria-label={t('audio.txLevel')}
            onChange={(event) => setAudio({ ...audio, txGain: Number(event.target.value) })}
          />
        </Field>
        <LevelMeter label="TX" read={() => transmitter.levelDb()} />
        <fieldset className="flex flex-col gap-3 border-t border-line pt-3">
          <legend className="sr-only">{t('audio.monitorLegend')}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="digi-monitor"
              className="size-4 accent-meter"
              checked={audio.monitorEnabled}
              onChange={(event) => setAudio({ ...audio, monitorEnabled: event.target.checked })}
            />
            {t('audio.monitorEnable')}
          </label>
          <Field label={t('audio.monitorDevice')}>
            <Select
              aria-label={t('audio.monitorDevice')}
              value={audio.monitorId ?? ''}
              disabled={!audio.monitorEnabled}
              onChange={(event) => setAudio({ ...audio, monitorId: event.target.value || null })}
            >
              <option value="">{t('audio.systemDefault')}</option>
              {list.outputs.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('audio.monitorVolume')} hint={`${Math.round(audio.monitorVolume * 100)} %`}>
            <Range
              min={0}
              max={1}
              step={0.01}
              value={audio.monitorVolume}
              disabled={!audio.monitorEnabled}
              aria-label={t('audio.monitorVolume')}
              onChange={(event) => setAudio({ ...audio, monitorVolume: Number(event.target.value) })}
            />
          </Field>
          {monitorConflict(audio) && (
            <p className="text-xs text-error" role="alert">
              {t('audio.monitorConflict')}
            </p>
          )}
          {audio.monitorEnabled && sameCard && (
            <p className="text-xs text-muted">
              {t('audio.sameCard')}
            </p>
          )}
        </fieldset>
        {error && <p className="text-xs text-error">{error}</p>}
        <p className="text-xs text-muted">
          {t('audio.digiModeHelp')}
        </p>
        <Button variant="tile" className="self-start" onClick={() => void refresh()}>
          {t('audio.refresh')}

        </Button>
      </div>
    </Dialog>
  )
}
