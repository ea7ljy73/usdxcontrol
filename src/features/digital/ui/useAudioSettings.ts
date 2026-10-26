import { useEffect } from 'react'
import { useDigital, useStoredState } from './useDigital'

export type AudioSettings = {
  inputId: string | null
  inputGain: number
  outputId: string | null
  txGain: number
}

export const DEFAULT_AUDIO: AudioSettings = {
  inputId: null,
  inputGain: 1,
  outputId: null,
  txGain: 0.5,
}

// Ajustes de audio recordados y aplicados al receptor y al transmisor.
export const useAudioSettings = () => {
  const { receiver, transmitter } = useDigital()
  const [audio, setAudio] = useStoredState<AudioSettings>('digi.audio', DEFAULT_AUDIO)
  useEffect(() => {
    if (receiver.getState().inputDeviceId !== audio.inputId) void receiver.setInputDevice(audio.inputId)
    receiver.setInputGain(audio.inputGain)
    transmitter.setOutput(audio.outputId)
    transmitter.setGain(audio.txGain)
  }, [receiver, transmitter, audio])
  return [audio, setAudio] as const
}
