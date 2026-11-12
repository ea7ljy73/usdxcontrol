import { useMemo } from 'react'
import { rxFrequencyDecodes } from '../domain/decodeList'
import { DecodeTable } from './decodeTable'
import { useDigital } from './useDigital'
import { useI18n } from '@/i18n/useI18n'

// Panel "Rx Frequency" de WSJT-X: el QSO en curso sin el ruido del resto de la banda.
export function RxFrequency() {
  const { t } = useI18n()
  const { receiverState, operatorState } = useDigital()
  const { rxHz, myCall } = operatorState.settings
  const decodes = useMemo(
    () => rxFrequencyDecodes(receiverState.decodes, { rxHz, myCall, dxCall: operatorState.dxCall }),
    [receiverState.decodes, rxHz, myCall, operatorState.dxCall],
  )

  return (
    <section aria-labelledby="digi-rx-frequency" className="flex min-h-32 min-w-0 flex-1 flex-col bg-panel-deep">
      <div className="flex items-center gap-2 bg-navy px-2 py-1">
        <h2 id="digi-rx-frequency" className="text-sm font-medium">
          Rx Frequency
        </h2>
        <span data-testid="digi-rx-hz" className="ml-auto font-mono text-xs text-rx">
          RX {rxHz} Hz
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-instrument">
        {decodes.length === 0 ? (
          <p className="p-3 text-xs text-muted">{t('digital.rxFrequencyEmpty')}</p>

        ) : (
          <DecodeTable decodes={decodes} testId="digi-rx-decodes" label="Rx Frequency" compact />
        )}
      </div>
    </section>
  )
}
