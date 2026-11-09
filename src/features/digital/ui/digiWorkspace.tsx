import { useState } from 'react'
import type { DigiMode } from '../domain/slots'
import { BandActivity } from './bandActivity'
import { DecodeMapDialog } from './decodeMapDialog'
import { DigiNotices } from './digiNotices'
import { DigiSettingsDialog } from './digiSettingsDialog'
import { DigiToolbar } from './digiToolbar'
import { DigiWaterfall } from './digiWaterfall'
import { LogbookDialog } from './logbookDialog'
import { LogQsoDialog } from './logQsoDialog'
import { PskReporterDialog } from './pskReporterDialog'
import { QsoPanel } from './qsoPanel'
import { RxFrequency } from './rxFrequency'

type Props = {
  dialHz: number | null
  onMode: (mode: DigiMode) => void
  onTune: (hz: number) => void
  // El audio se configura en un único diálogo, también accesible desde la cabecera.
  onOpenAudio: () => void
}

type DialogId = 'map' | 'logbook' | 'settings' | 'psk'

// Pantalla completa de FT8/FT4 al estilo WSJT-X: actividad de banda, cascada y QSO.
export function DigiWorkspace({ dialHz, onMode, onTune, onOpenAudio }: Props) {
  const [dialog, setDialog] = useState<DialogId | null>(null)
  const openChange = (id: DialogId) => (open: boolean) => setDialog(open ? id : null)

  return (
    <div data-testid="digi-workspace" className="flex min-h-0 min-w-0 flex-1 flex-col gap-px bg-line">
      <DigiToolbar dialHz={dialHz} onMode={onMode} onTune={onTune} onOpenDialog={(id) => (id === 'audio' ? onOpenAudio() : setDialog(id))} />
      <div className="grid min-h-0 flex-1 gap-px lg:grid-cols-[3fr_2fr]">
        <BandActivity />
        <div className="flex min-h-0 min-w-0 flex-col gap-px">
          <DigiWaterfall />
          <RxFrequency />
        </div>
      </div>
      <QsoPanel onOpenSettings={() => setDialog('settings')} />
      <DecodeMapDialog open={dialog === 'map'} onOpenChange={openChange('map')} />
      <LogbookDialog open={dialog === 'logbook'} onOpenChange={openChange('logbook')} />
      <PskReporterDialog open={dialog === 'psk'} onOpenChange={openChange('psk')} />
      <DigiSettingsDialog open={dialog === 'settings'} onOpenChange={openChange('settings')} />
      <LogQsoDialog />
      <DigiNotices />
    </div>
  )
}
