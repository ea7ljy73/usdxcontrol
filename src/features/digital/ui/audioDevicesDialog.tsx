import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Range, Select } from '@/components/ui/field'
import type { AudioDevice } from '../application/ports'
import { LevelMeter } from './levelMeter'
import { monitorConflict, type AudioSettings } from './useAudioSettings'
import { useDigital } from './useDigital'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  audio: AudioSettings
  onAudioChange: (audio: AudioSettings) => void
}

// Tarjetas de sonido de la radio: entrada para decodificar y salida para transmitir.
export function AudioDevicesDialog({ open, onOpenChange, audio, onAudioChange: setAudio }: Props) {
  const { devices, receiver, transmitter } = useDigital()
  const [list, setList] = useState<{
    inputs: AudioDevice[]
    outputs: AudioDevice[]
  }>({ inputs: [], outputs: [] })
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    () =>
      devices.list().then(
        (found) => {
          setList(found)
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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Audio de la radio"
      description="La entrada recibe el audio del receptor; la salida lleva el audio FT8/FT4 a la radio en transmisión; la escucha saca lo recibido por los altavoces del PC."
    >
      <div className="flex flex-col gap-3">
        <Field label="Entrada (RX)">
          <Select value={audio.inputId ?? ''} onChange={(event) => setAudio({ ...audio, inputId: event.target.value || null })}>
            <option value="">Predeterminada del sistema</option>
            {list.inputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ganancia de entrada" hint={`${Math.round(audio.inputGain * 100)} %`}>
          <Range
            min={0}
            max={4}
            step={0.05}
            value={audio.inputGain}
            aria-label="Ganancia de entrada"
            onChange={(event) => setAudio({ ...audio, inputGain: Number(event.target.value) })}
          />
        </Field>
        <LevelMeter label="RX" read={() => receiver.input()?.levelDb() ?? -120} />
        <Field label="Salida (TX)">
          <Select value={audio.outputId ?? ''} onChange={(event) => setAudio({ ...audio, outputId: event.target.value || null })}>
            <option value="">Predeterminada del sistema</option>
            {list.outputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nivel de transmisión" hint={`${Math.round(audio.txGain * 100)} %`}>
          <Range
            min={0}
            max={1}
            step={0.01}
            value={audio.txGain}
            aria-label="Nivel de transmisión"
            onChange={(event) => setAudio({ ...audio, txGain: Number(event.target.value) })}
          />
        </Field>
        <LevelMeter label="TX" read={() => transmitter.levelDb()} />
        <fieldset className="flex flex-col gap-3 border-t border-line pt-3">
          <legend className="sr-only">Escucha en el PC</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="digi-monitor"
              className="size-4 accent-meter"
              checked={audio.monitorEnabled}
              onChange={(event) => setAudio({ ...audio, monitorEnabled: event.target.checked })}
            />
            Escuchar la radio en el PC
          </label>
          <Field label="Altavoces (escucha)">
            <Select
              aria-label="Altavoces (escucha)"
              value={audio.monitorId ?? ''}
              disabled={!audio.monitorEnabled}
              onChange={(event) => setAudio({ ...audio, monitorId: event.target.value || null })}
            >
              <option value="">Predeterminada del sistema</option>
              {list.outputs.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Volumen de escucha" hint={`${Math.round(audio.monitorVolume * 100)} %`}>
            <Range
              min={0}
              max={1}
              step={0.01}
              value={audio.monitorVolume}
              disabled={!audio.monitorEnabled}
              aria-label="Volumen de escucha"
              onChange={(event) => setAudio({ ...audio, monitorVolume: Number(event.target.value) })}
            />
          </Field>
          {monitorConflict(audio) && (
            <p className="text-xs text-error" role="alert">
              La escucha no puede salir por la misma tarjeta que va a la radio (Salida TX): elige los altavoces del PC.
            </p>
          )}
          {audio.monitorEnabled && sameCard && (
            <p className="text-xs text-muted">
              Salida TX y escucha usan la tarjeta predeterminada: elige en «Salida (TX)» la tarjeta de la radio para no mezclarlas.
            </p>
          )}
        </fieldset>
        {error && <p className="text-xs text-error">{error}</p>}
        <p className="text-xs text-muted">
          Ajusta el nivel de TX para que la radio no recorte: con DIGI Mode activo en el uSDX la potencia no depende del volumen,
          pero un nivel excesivo genera armónicos.
        </p>
        <Button variant="tile" className="self-start" onClick={() => void refresh()}>
          Actualizar dispositivos
        </Button>
      </div>
    </Dialog>
  )
}
