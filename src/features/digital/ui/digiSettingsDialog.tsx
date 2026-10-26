import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select, TextInput } from '@/components/ui/field'
import { GRID_RE } from '../domain/grid'
import { isValidCall } from '../domain/messages'
import { useDigital } from './useDigital'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const WATCHDOG_MIN = [2, 4, 6, 10, 15, 30]

// Ajustes que se ponen una vez: estación y comportamiento de la secuencia.
export function DigiSettingsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ajustes FT8"
      description="Tu estación y cómo se comporta la secuencia."
    >
      {open && <SettingsForm onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const { operator, operatorState } = useDigital()
  const { settings } = operatorState
  const [myCall, setMyCall] = useState(settings.myCall)
  const [myGrid, setMyGrid] = useState(settings.myGrid)
  const callOk = myCall === '' || isValidCall(myCall)
  const gridOk = myGrid === '' || GRID_RE.test(myGrid)

  return (
    <form
      className="grid grid-cols-2 gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!callOk || !gridOk) return
        operator.updateSettings({ myCall, myGrid })
        onDone()
      }}
    >
      <Field label="Mi indicativo" hint={callOk ? undefined : 'no válido'}>
        <TextInput
          autoFocus
          required
          aria-invalid={!callOk}
          placeholder="EA7XXX"
          className="font-mono uppercase"
          value={myCall}
          onChange={(event) => setMyCall(event.target.value.toUpperCase().trim())}
        />
      </Field>
      <Field label="Mi locator" hint={gridOk ? '4 o 6 caracteres' : 'no válido'}>
        <TextInput
          aria-invalid={!gridOk}
          placeholder="IM76"
          maxLength={6}
          className="font-mono uppercase"
          value={myGrid}
          onChange={(event) => setMyGrid(event.target.value.toUpperCase().trim())}
        />
      </Field>
      <Field label="Cierre del QSO">
        <Select
          value={settings.use73 ? '73' : 'RR73'}
          onChange={(event) => operator.updateSettings({ use73: event.target.value === '73' })}
        >
          <option value="RR73">RR73 (recomendado)</option>
          <option value="73">RRR y 73</option>
        </Select>
      </Field>
      <Field label="Vigilante de TX" hint="sin cambios, deja de transmitir">
        <Select
          value={String(settings.txWatchdogMin)}
          onChange={(event) => operator.updateSettings({ txWatchdogMin: Number(event.target.value) })}
        >
          {WATCHDOG_MIN.map((minutes) => (
            <option key={minutes} value={String(minutes)}>
              {minutes} min
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Secuencia de TX" className="col-span-2">
        <Select
          value={settings.autoSlot ? 'auto' : 'manual'}
          onChange={(event) => operator.updateSettings({ autoSlot: event.target.value === 'auto' })}
        >
          <option value="auto">Automática: la contraria a la estación que contesto</option>
          <option value="manual">Manual: siempre la elegida (par o impar)</option>
        </Select>
      </Field>
      <div className="col-span-2 flex justify-end">
        <Button type="submit" disabled={!myCall || !callOk || !gridOk} className="h-8 text-xs">
          Guardar
        </Button>
      </div>
    </form>
  )
}
