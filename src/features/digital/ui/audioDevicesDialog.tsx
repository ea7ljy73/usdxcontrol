import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Range, Select } from '@/components/ui/field'
import type { AudioDevice } from '../application/ports'
import { LevelMeter } from './levelMeter'
import type { AudioSettings } from './useAudioSettings'
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
    if (open) void refresh()
  }, [open, refresh])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Audio de la radio"
      description="La entrada recibe el audio del receptor; la salida lleva el audio FT8 a la radio en transmisión."
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
