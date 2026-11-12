import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, TextInput } from '@/components/ui/field'
import type { LogDraft } from '../application/ft8Operator'
import { rfMhz } from '../domain/logbook'
import { useDigital } from './useDigital'
import { useI18n } from '@/i18n/useI18n'

// Confirmación del QSO antes de guardarlo (se abre sola al terminar la secuencia).
export function LogQsoDialog() {
  const { t } = useI18n()
  const { operator, operatorState } = useDigital()
  const draft = operatorState.logDraft
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => !open && operator.discardLog()}
      title={t('digital.log.title')}
      description={draft ? `${draft.mode} · ${rfMhz(draft)} MHz` : undefined}
    >
      {draft && <LogForm key={`${draft.endedAt}-${draft.call}`} draft={draft} />}
    </Dialog>
  )
}

function LogForm({ draft }: { draft: LogDraft }) {
  const { t } = useI18n()
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
      <Field label={t('digital.log.call')}>
        <TextInput
          required
          className="font-mono uppercase"
          value={form.call}
          onChange={(event) => set({ call: event.target.value.toUpperCase() })}
        />
      </Field>
      <Field label={t('digital.log.grid')}>
        <TextInput
          className="font-mono uppercase"
          value={form.grid}
          onChange={(event) => set({ grid: event.target.value.toUpperCase() })}
        />
      </Field>
      <Field label={t('digital.log.rstSent')}>
        <TextInput className="font-mono" value={form.rstSent} onChange={(event) => set({ rstSent: event.target.value })} />
      </Field>
      <Field label={t('digital.log.rstRcvd')}>
        <TextInput className="font-mono" value={form.rstRcvd} onChange={(event) => set({ rstRcvd: event.target.value })} />
      </Field>
      <Field label={t('digital.log.start')}>
        <TextInput className="font-mono" readOnly value={form.startedAt.slice(0, 19).replace('T', ' ')} />
      </Field>
      <Field label={t('digital.log.end')}>
        <TextInput className="font-mono" readOnly value={form.endedAt.slice(0, 19).replace('T', ' ')} />
      </Field>
      <Field label={t('digital.log.notes')} className="col-span-2">
        <TextInput value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
      </Field>
      <div className="col-span-2 flex justify-end gap-1 pt-1">
        <Button variant="tile" className="h-8 text-xs" onClick={operator.discardLog}>
          {t('digital.log.discard')}
        </Button>
        <Button type="submit" variant="navy" className="h-8 text-xs">
          {t('digital.log.save')}

        </Button>
      </div>
    </form>
  )
}
