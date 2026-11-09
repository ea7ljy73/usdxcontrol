import { useEffect } from 'react'
import { useDigital, useStoredState } from './useDigital'

export type AudioSettings = {
  inputId: string | null
  inputGain: number
  outputId: string | null
  txGain: number
  // Escuchar el audio de la radio por los altavoces del PC.
  monitorEnabled: boolean
  monitorId: string | null
  monitorVolume: number
}

export const DEFAULT_AUDIO: AudioSettings = {
  inputId: null,
  inputGain: 1,
  outputId: null,
  txGain: 0.5,
  monitorEnabled: false,
  monitorId: null,
  monitorVolume: 0.5,
}

// La escucha no puede salir por la tarjeta que va a la radio: el audio recibido se
// colaría en la entrada de micrófono del transceptor.
export const monitorConflict = (audio: AudioSettings): boolean =>
  audio.monitorEnabled && audio.monitorId !== null && audio.monitorId === audio.outputId

// Ajustes de audio recordados y aplicados al receptor y al transmisor.
export const useAudioSettings = () => {
  const { receiver, transmitter } = useDigital()
  const [audio, setAudio] = useStoredState<AudioSettings>('digi.audio', DEFAULT_AUDIO)
  useEffect(() => {
    if (receiver.getState().inputDeviceId !== audio.inputId) void receiver.setInputDevice(audio.inputId)
    receiver.setInputGain(audio.inputGain)
    receiver.setMonitor({
      enabled: audio.monitorEnabled && !monitorConflict(audio),
      deviceId: audio.monitorId,
      volume: audio.monitorVolume,
    })
    transmitter.setOutput(audio.outputId)
    transmitter.setGain(audio.txGain)
  }, [receiver, transmitter, audio])
  return [audio, setAudio] as const
}
