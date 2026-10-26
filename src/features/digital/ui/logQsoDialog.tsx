import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, TextInput } from '@/components/ui/field'
import type { LogDraft } from '../application/ft8Operator'
import { rfMhz } from '../domain/logbook'
import { useDigital } from './useDigital'

// Confirmación del QSO antes de guardarlo (se abre sola al terminar la secuencia).
export function LogQsoDialog() {
  const { operator, operatorState } = useDigital()
  const draft = operatorState.logDraft
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => !open && operator.discardLog()}
      title="Guardar QSO"
      description={draft ? `${draft.mode} · ${rfMhz(draft)} MHz` : undefined}
    >
      {draft && <LogForm key={`${draft.endedAt}-${draft.call}`} draft={draft} />}
    </Dialog>
  )
}

function LogForm({ draft }: { draft: LogDraft }) {
  const { operator } = useDigital()
  const [form, setForm] = useState(draft)
  const set = (patch: Partial<LogDraft>) => setForm((current) => ({ ...current, ...patch }))

  return (
    <form
      className="grid grid-cols-2 gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (form.call.trim()) operator.saveLog(form)
      }}
    >
      <Field label="Indicativo">
        <TextInput
          required
          className="font-mono uppercase"
          value={form.call}
          onChange={(event) => set({ call: event.target.value.toUpperCase() })}
        />
      </Field>
      <Field label="Locator">
        <TextInput
          className="font-mono uppercase"
          value={form.grid}
          onChange={(event) => set({ grid: event.target.value.toUpperCase() })}
        />
      </Field>
      <Field label="Reporte enviado">
        <TextInput className="font-mono" value={form.rstSent} onChange={(event) => set({ rstSent: event.target.value })} />
      </Field>
      <Field label="Reporte recibido">
        <TextInput className="font-mono" value={form.rstRcvd} onChange={(event) => set({ rstRcvd: event.target.value })} />
      </Field>
      <Field label="Inicio (UTC)">
        <TextInput className="font-mono" readOnly value={form.startedAt.slice(0, 19).replace('T', ' ')} />
      </Field>
      <Field label="Fin (UTC)">
        <TextInput className="font-mono" readOnly value={form.endedAt.slice(0, 19).replace('T', ' ')} />
      </Field>
      <Field label="Notas" className="col-span-2">
        <TextInput value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
      </Field>
      <div className="col-span-2 flex justify-end gap-1 pt-1">
        <Button variant="tile" className="h-8 text-xs" onClick={operator.discardLog}>
          Descartar
        </Button>
        <Button type="submit" variant="navy" className="h-8 text-xs">
          Guardar en el libro
        </Button>
      </div>
    </form>
  )
}
