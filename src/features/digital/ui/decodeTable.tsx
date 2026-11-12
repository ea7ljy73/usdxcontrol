import { useMemo } from 'react'
import { cn } from '@/lib/cn'
import type { DigiDecode } from '../domain/decodeList'
import { resolveDxcc } from '../domain/dxcc'
import { workedIndex, type WorkedStatus } from '../domain/logbook'
import { formatSlotUtc } from '../domain/slots'
import { useDigital } from './useDigital'
import { useI18n } from '@/i18n/useI18n'
import { countryName } from '@/i18n/countries'

const formatSnr = (db: number) => (db >= 0 ? `+${String(db).padStart(2, '0')}` : `-${String(-db).padStart(2, '0')}`)

const countryOf = (call: string) => resolveDxcc(call)?.entity ?? null

const WORKED: Record<WorkedStatus, { mark: string; className: string }> = {
  'new-country': { mark: '★ ', className: 'text-slice' },
  'new-call': { mark: '', className: 'text-muted' },
  worked: { mark: '✓ ', className: 'text-muted' },
}

type Props = { decodes: DigiDecode[]; testId: string; label: string; compact?: boolean }

// Tabla de decodificados de WSJT-X: CQ en verde, lo dirigido a nosotros resaltado en rojo,
// la estación DX recuadrada y país nuevo con estrella. Clic: DX · doble clic o Intro: contestar.
export function DecodeTable({ decodes, testId, label, compact = false }: Props) {
  const { t } = useI18n()
  const { operator, operatorState } = useDigital()
  const myCall = operatorState.settings.myCall
  const worked = useMemo(() => workedIndex(operatorState.logbook, countryOf), [operatorState.logbook])

  return (
    <table data-testid={testId} aria-label={label} className="w-full font-mono text-xs tabular-nums">
      <thead className="sticky top-0 z-10 bg-panel-deep text-left text-muted">
        <tr>
          <th scope="col" className="px-2 py-0.5 font-normal">
            UTC
          </th>
          <th scope="col" className="px-1 py-0.5 text-right font-normal">
            dB
          </th>
          {!compact && (
            <th scope="col" className="px-1 py-0.5 text-right font-normal">
              DT
            </th>
          )}
          <th scope="col" className="px-1 py-0.5 text-right font-normal">
            Freq
          </th>
          <th scope="col" className="w-full px-2 py-0.5 font-normal">
            {t('digital.table.message')}
          </th>
          {!compact && (
            <th scope="col" className="hidden px-2 py-0.5 font-normal md:table-cell">
              {t('digital.table.country')}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {decodes.map((decode, index) => {
          const firstOfSlot = index > 0 && decodes[index - 1].slotStartMs !== decode.slotStartMs
          const from = decode.tx ? undefined : decode.parsed?.fromCall
          const toMe = !decode.tx && myCall !== '' && decode.parsed?.toCall === myCall
          const isDx = from !== undefined && from === operatorState.dxCall
          // Como WSJT-X, "trabajado antes" solo se marca en quien llama CQ o nos llama.
          const status = from && (decode.parsed?.kind === 'cq' || toMe) ? worked(from) : null
          const entity = from ? countryOf(from) : null
          const country = entity ? countryName(entity) : null
          return (
            <tr
              key={decode.id}
              data-kind={decode.tx ? 'tx' : toMe ? 'me' : decode.parsed?.kind}
              data-worked={status ?? undefined}
              className={cn(
                decode.tx ? 'text-tx' : toMe ? 'bg-tx/25 text-fg' : decode.parsed?.kind === 'cq' ? 'text-rx' : 'text-fg',
                isDx && 'outline outline-1 -outline-offset-1 outline-slice',
                firstOfSlot && 'border-t border-line',
              )}
            >
              <td className="px-2">{formatSlotUtc(decode.slotStartMs)}</td>
              <td className="px-1 text-right">{decode.tx ? 'TX' : formatSnr(decode.snrDb)}</td>
              {!compact && <td className="px-1 text-right">{decode.tx ? '' : decode.dtS.toFixed(1)}</td>}
              <td className="px-1 text-right">{decode.audioHz}</td>
              <td className="px-0">
                <button
                  type="button"
                  disabled={!from}
                  title={from ? t('digital.table.rowTitle') : undefined}
                  className="w-full px-2 text-left whitespace-nowrap outline-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-slice disabled:cursor-default disabled:hover:bg-transparent"
                  onClick={() => operator.select(decode)}
                  onDoubleClick={(event) => operator.answer(decode, { moveTx: event.ctrlKey || event.metaKey })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      operator.answer(decode, { moveTx: event.ctrlKey || event.metaKey })
                    }
                  }}
                >
                  {status === 'new-country' && compact && <span className="text-slice">★ </span>}
                  {decode.text}
                </button>
              </td>
              {!compact && (
                <td
                  title={status ? t(`digital.table.worked.${status}`) : undefined}

                  className={cn(
                    'hidden max-w-36 truncate px-2 font-sans md:table-cell',
                    status ? WORKED[status].className : 'text-muted',
                  )}
                >
                  {status && country ? `${WORKED[status].mark}${country}` : (country ?? '')}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
