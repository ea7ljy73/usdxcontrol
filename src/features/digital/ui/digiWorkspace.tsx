import { useState } from 'react'
import type { DigiMode } from '../domain/slots'
import { AudioDevicesDialog } from './audioDevicesDialog'
import { BandActivity } from './bandActivity'
import { DecodeMapDialog } from './decodeMapDialog'
import { DigiNotices } from './digiNotices'
import { DigiSettingsDialog } from './digiSettingsDialog'
import { DigiToolbar } from './digiToolbar'
import { DigiWaterfall } from './digiWaterfall'
import { LogbookDialog } from './logbookDialog'
import { LogQsoDialog } from './logQsoDialog'
import { QsoPanel } from './qsoPanel'
import { RxFrequency } from './rxFrequency'
import { useAudioSettings } from './useAudioSettings'

type Props = {
  dialHz: number | null
  onMode: (mode: DigiMode) => void
  onTune: (hz: number) => void
}

type DialogId = 'audio' | 'map' | 'logbook' | 'settings'

// Pantalla completa de FT8/FT4 al estilo WSJT-X: actividad de banda, cascada y QSO.
export function DigiWorkspace({ dialHz, onMode, onTune }: Props) {
  const [dialog, setDialog] = useState<DialogId | null>(null)
  const [audio, setAudio] = useAudioSettings()
  const openChange = (id: DialogId) => (open: boolean) => setDialog(open ? id : null)

  return (
    <div data-testid="digi-workspace" className="flex min-h-0 min-w-0 flex-1 flex-col gap-px bg-bg">
      <DigiToolbar dialHz={dialHz} onMode={onMode} onTune={onTune} onOpenDialog={setDialog} />
      <div className="grid min-h-0 flex-1 gap-px lg:grid-cols-[3fr_2fr]">
        <BandActivity />
        <div className="flex min-h-0 min-w-0 flex-col gap-px">
          <DigiWaterfall />
          <RxFrequency />
        </div>
      </div>
      <QsoPanel onOpenSettings={() => setDialog('settings')} />
      <AudioDevicesDialog open={dialog === 'audio'} onOpenChange={openChange('audio')} audio={audio} onAudioChange={setAudio} />
      <DecodeMapDialog open={dialog === 'map'} onOpenChange={openChange('map')} />
      <LogbookDialog open={dialog === 'logbook'} onOpenChange={openChange('logbook')} />
      <DigiSettingsDialog open={dialog === 'settings'} onOpenChange={openChange('settings')} />
      <LogQsoDialog />
      <DigiNotices />
    </div>
  )
}
