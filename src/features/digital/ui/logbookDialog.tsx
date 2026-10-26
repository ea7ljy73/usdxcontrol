import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { rfMhz } from '../domain/logbook'
import { useDigital } from './useDigital'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`

// Libro de guardia local con exportación e importación ADIF.
export function LogbookDialog({ open, onOpenChange }: Props) {
  const { operator, operatorState, logFiles } = useDigital()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { logbook, settings } = operatorState

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      operator.importLog(await logFiles.importAdif(file, settings.myCall))
    } catch (cause) {
      operator.notify(`No se pudo leer el ADIF: ${cause instanceof Error ? cause.message : String(cause)}`, 'error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Libro de guardia · ${logbook.length} QSO`} className="max-w-4xl">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          <Button
            variant="tile"
            className="h-8 px-3 text-xs"
            disabled={logbook.length === 0}
            onClick={() => logFiles.exportAdif(logbook, settings.myCall)}
          >
            Exportar ADIF
          </Button>
          <Button variant="tile" className="h-8 px-3 text-xs" onClick={() => fileRef.current?.click()}>
            Importar ADIF…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".adi,.adif,text/plain"
            className="hidden"
            aria-label="Fichero ADIF"
            onChange={(event) => {
              void importFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
        {logbook.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Todavía no hay QSO en el libro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="digi-logbook" className="w-full font-mono text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-1.5 py-1 font-normal">UTC</th>
                  <th className="px-1.5 py-1 font-normal">Indicativo</th>
                  <th className="px-1.5 py-1 font-normal">Locator</th>
                  <th className="px-1.5 py-1 font-normal">MHz</th>
                  <th className="px-1.5 py-1 font-normal">Modo</th>
                  <th className="px-1.5 py-1 font-normal">Env</th>
                  <th className="px-1.5 py-1 font-normal">Rec</th>
                  <th className="px-1.5 py-1 font-normal">Notas</th>
                  <th className="px-1.5 py-1 font-normal">
                    <span className="sr-only">Acciones</span>
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
                        aria-label={`Borrar QSO con ${entry.call}`}
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
      </div>
    </Dialog>
  )
}
