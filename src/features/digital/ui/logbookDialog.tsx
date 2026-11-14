import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { rfMhz } from '../domain/logbook'
import { useDigital } from './useDigital'
import { IntegrationsPanel } from '@/features/integrations/ui/integrationsPanel'
import { useI18n } from '@/i18n/useI18n'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`

// Libro de guardia local con exportación e importación ADIF.
export function LogbookDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n()
  const { operator, operatorState, logFiles } = useDigital()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [tab, setTab] = useState<'log' | 'online'>('log')
  const { logbook, settings } = operatorState

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      operator.importLog(await logFiles.importAdif(file, settings.myCall))
    } catch (cause) {
      operator.notify(t('digital.logbook.importFailed', { error: cause instanceof Error ? cause.message : String(cause) }), 'error')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={tab === 'log' ? t('digital.logbook.title', { count: logbook.length }) : t('integrations.title')}
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-2">
        <div role="tablist" className="flex gap-1 border-b border-line pb-1">
          <Button
            variant="tile"
            className="h-8 px-3 text-xs"
            role="tab"
            aria-selected={tab === 'log'}
            aria-pressed={tab === 'log'}
            onClick={() => setTab('log')}
          >
            {t('integrations.logTab')}
          </Button>
          <Button
            variant="tile"
            className="h-8 px-3 text-xs"
            role="tab"
            aria-selected={tab === 'online'}
            aria-pressed={tab === 'online'}
            onClick={() => setTab('online')}
          >
            {t('integrations.tab')}
          </Button>
        </div>
        {tab === 'online' ? (
          <IntegrationsPanel />
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="tile"
                className="h-8 px-3 text-xs"
                disabled={logbook.length === 0}
                onClick={() => logFiles.exportAdif(logbook, settings.myCall)}
              >
                {t('digital.logbook.export')}
              </Button>
              <Button variant="tile" className="h-8 px-3 text-xs" onClick={() => fileRef.current?.click()}>
                {t('digital.logbook.import')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".adi,.adif,text/plain"
                className="hidden"
                aria-label={t('digital.logbook.file')}
                onChange={(event) => {
                  void importFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>
            {logbook.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t('digital.logbook.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table data-testid="digi-logbook" className="w-full font-mono text-xs">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="px-1.5 py-1 font-normal">UTC</th>
                      <th className="px-1.5 py-1 font-normal">{t('digital.log.call')}</th>
                      <th className="px-1.5 py-1 font-normal">{t('digital.log.grid')}</th>
                      <th className="px-1.5 py-1 font-normal">MHz</th>
                      <th className="px-1.5 py-1 font-normal">{t('digital.logbook.mode')}</th>
                      <th className="px-1.5 py-1 font-normal">{t('digital.logbook.sent')}</th>
                      <th className="px-1.5 py-1 font-normal">{t('digital.logbook.rcvd')}</th>
                      <th className="px-1.5 py-1 font-normal">{t('digital.log.notes')}</th>
                      <th className="px-1.5 py-1 font-normal">
                        <span className="sr-only">{t('digital.logbook.actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logbook.map((entry) => (
                      <tr key={entry.id} className="odd:bg-panel-deep">
                        <td className="px-1.5 py-1 whitespace-nowrap">{utc(entry.endedAt)}</td>
                        <td className="px-1.5 py-1 text-fg">{entry.call}</td>
                        <td className="px-1.5 py-1">{entry.grid}</td>
                        <td className="px-1.5 py-1">{entry.dialHz ? rfMhz(entry) : ''}</td>
                        <td className="px-1.5 py-1">{entry.mode}</td>
                        <td className="px-1.5 py-1">{entry.rstSent}</td>
                        <td className="px-1.5 py-1">{entry.rstRcvd}</td>
                        <td className="max-w-40 truncate px-1.5 py-1 font-sans">{entry.notes}</td>
                        <td className="px-1.5 py-1 text-right">
                          <button
                            type="button"
                            aria-label={t('digital.logbook.delete', { call: entry.call })}

                            className="px-1 text-muted hover:text-tx"
                            onClick={() => operator.deleteLogEntry(entry.id)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </>
        )}
      </div>
    </Dialog>
  )
}
