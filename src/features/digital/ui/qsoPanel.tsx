import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { resolveDxcc } from '../domain/dxcc'
import { txMessage, type QsoPhase } from '../domain/ft8qso'
import { gridDistanceKm } from '../domain/grid'
import { isValidCall, standardMessages } from '../domain/messages'
import { nextTxSlot, slotStartMs, TX_START_OFFSET_MS } from '../domain/slots'
import { useDigital, useUtcNow } from './useDigital'

const PHASES: { phase: QsoPhase; label: string }[] = [
  { phase: 'cq', label: 'CQ' },
  { phase: 'call', label: 'Llamada' },
  { phase: 'report', label: 'Reporte' },
  { phase: 'roger', label: 'R+Rpt' },
  { phase: 'rr73', label: 'RR73' },
  { phase: 'done', label: 'Hecho' },
]

type CommitProps = { value: string; onCommit: (value: string) => void } & Omit<
  Parameters<typeof TextInput>[0],
  'value' | 'onChange'
>

// Campo de texto que se edita en local y se confirma al salir (o con Intro).
// Si el valor cambia desde fuera, el campo se vuelve a montar con él.
function CommitInput(props: CommitProps) {
  return <DraftInput key={props.value} {...props} />
}

function DraftInput({ value, onCommit, ...props }: CommitProps) {
  const [draft, setDraft] = useState(value)
  return (
    <TextInput
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value.toUpperCase())}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(draft)
      }}
    />
  )
}

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: string; title?: string }) {
  return (
    <Button variant={on ? 'navy' : 'tile'} aria-pressed={on} title={title} className="h-8 px-2 text-xs" onClick={onClick}>
      {children}
    </Button>
  )
}

// Panel inferior de la pantalla FT8: estación DX, mensajes Tx1–Tx6, secuencia y control de TX.
export function QsoPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { receiverState, operator, operatorState } = useDigital()
  const { settings, qso, dxCall, dxGrid, txEnabled, tx, waiting, oneShot } = operatorState
  const ft4 = receiverState.mode === 'FT4'
  const messages = standardMessages({
    myCall: settings.myCall,
    myGrid: settings.myGrid,
    dxCall,
    reportDb: qso.report,
  })
  const nextMessage =
    oneShot ??
    (operatorState.txOverride.trim() ||
      txMessage({
        ...qso,
        myCall: settings.myCall,
        myGrid: settings.myGrid.slice(0, 4),
      }))
  const dxCountry = dxCall ? resolveDxcc(dxCall)?.entity : undefined
  const distance = dxGrid && settings.myGrid ? gridDistanceKm(settings.myGrid, dxGrid) : null
  const now = useUtcNow(500)
  const nextTxStart = slotStartMs(nextTxSlot(now, receiverState.mode, settings.txParity), receiverState.mode) + TX_START_OFFSET_MS
  const waitS = Math.max(0, Math.ceil((nextTxStart - now) / 1_000))
  const parityLabel = settings.txParity === 'odd' ? 'impar' : 'par'

  return (
    <section aria-label="QSO" className="grid gap-px bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5 bg-panel-deep p-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Estación DX</h2>
          <button
            type="button"
            data-testid="digi-my-station"
            className="ml-auto font-mono text-xs text-muted hover:text-fg"
            title="Mi indicativo y locator"
            onClick={onOpenSettings}
          >
            {settings.myCall ? `${settings.myCall} · ${settings.myGrid || '----'}` : 'Configurar mi indicativo…'}
          </button>
        </div>
        {!isValidCall(settings.myCall) && (
          <p role="alert" className="flex items-center gap-2 bg-instrument px-2 py-1 text-xs text-slice">
            Para transmitir pon tu indicativo y locator.
            <Button variant="navy" className="ml-auto h-6 px-2 text-xs" onClick={onOpenSettings}>
              Ajustes…
            </Button>
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Field label="DX indicativo" hint={dxCountry}>
            <CommitInput
              placeholder="—"
              value={dxCall}
              onCommit={(value) => operator.setDx(value, dxGrid)}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="DX locator" hint={distance !== null ? `${distance} km` : undefined}>
            <CommitInput
              placeholder="—"
              value={dxGrid}
              onCommit={(value) => operator.setDx(dxCall, value)}
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Mensaje libre" hint="vacío = automático" className="col-span-2">
            <CommitInput
              placeholder="automático"
              maxLength={37}
              value={operatorState.txOverride}
              onCommit={(value) => operator.setTxOverride(value)}
              className="font-mono uppercase"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-px">
          <Button variant="tile" className="h-8 px-2 text-xs" disabled={!dxCall || ft4} onClick={operator.callDx}>
            Llamar DX
          </Button>
          <Button variant="tile" className="h-8 px-2 text-xs" disabled={!dxCall} onClick={() => operator.addWaiting()}>
            Añadir a espera
          </Button>
          <Button variant="tile" className="h-8 px-2 text-xs" onClick={operator.resetQso}>
            Borrar DX
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 bg-panel-deep p-2">
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Mensajes</h2>
        <ol className="flex flex-col gap-px">
          {messages.map((message, index) => (
            <li key={message.id} className="flex items-center gap-px">
              <span className="w-9 shrink-0 bg-instrument px-1 py-1 text-center font-mono text-xs text-muted">Tx{index + 1}</span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate bg-instrument px-2 py-1 font-mono text-xs',
                  message.text && message.text === nextMessage ? 'text-slice' : 'text-fg',
                  !message.text && 'text-muted',
                )}
              >
                {message.text ?? `(${message.label}: falta indicativo)`}
              </span>
              <Button
                variant="tile"
                aria-label={`Enviar Tx${index + 1} ${message.label}`}
                className="h-6 px-2 text-xs"
                disabled={!message.text || ft4}
                onClick={() => operator.sendStandard(message.id)}
              >
                Enviar
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-1" aria-label="Secuencia del QSO">
          {PHASES.map(({ phase, label }) => (
            <span
              key={phase}
              data-active={qso.phase === phase}
              className={cn(
                'px-1.5 py-0.5 text-[11px]',
                qso.phase === phase ? 'bg-slice text-instrument' : 'bg-instrument text-muted',
              )}
            >
              {label}
            </span>
          ))}
          <span data-testid="digi-qso-phase" className="sr-only">
            {qso.phase}
          </span>
        </div>
        <div className="flex flex-wrap gap-px">
          <Button variant="tile" className="h-7 px-2 text-xs" onClick={operator.advancePhase}>
            Siguiente paso →
          </Button>
          <Button variant="tile" className="h-7 px-2 text-xs" onClick={operator.restartSequence}>
            Reiniciar secuencia
          </Button>
          <Button variant="tile" className="h-7 px-2 text-xs" disabled={ft4} onClick={operator.sendNow}>
            Enviar ahora
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 bg-panel-deep p-2">
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Transmisión</h2>
        <div
          data-testid="digi-tx-status"
          className={cn(
            'min-h-8 bg-instrument px-2 py-1 font-mono text-xs',
            tx.phase === 'on-air' || operatorState.tuning ? 'text-error' : 'text-muted',
          )}
        >
          {operatorState.tuning
            ? `TUNE ▶ portadora en ${settings.toneHz} Hz`
            : tx.phase === 'on-air'
              ? `TX ▶ ${tx.message}`
              : tx.phase === 'scheduled'
                ? `Preparado: ${tx.message}`
                : ft4
                  ? 'FT4: solo recepción'
                  : nextMessage && (txEnabled || oneShot)
                    ? `Próximo (${parityLabel}, en ${waitS} s): ${nextMessage}`
                    : 'Sin transmisión'}
        </div>
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4 [&>button]:px-1 [&>button]:whitespace-nowrap">
          <Button
            data-testid="digi-enable-tx"
            variant={txEnabled ? 'navy' : 'tile'}
            aria-pressed={txEnabled}
            disabled={ft4}
            className={cn('h-9 text-xs', txEnabled && 'text-error')}
            onClick={() => operator.setTxEnabled(!txEnabled)}
          >
            Habilitar TX
          </Button>
          <Button variant="tile" className="h-9 text-xs" disabled={ft4} onClick={operator.callCq}>
            Llamar CQ
          </Button>
          <Button
            variant={operatorState.tuning ? 'navy' : 'tile'}
            aria-pressed={operatorState.tuning}
            title="Portadora continua en el tono de TX para ajustar la potencia (se corta a los 60 s)"
            className={cn('h-9 text-xs', operatorState.tuning && 'text-error')}
            onClick={() => void operator.tune(!operatorState.tuning)}
          >
            Tune
          </Button>
          <Button
            variant="tile"
            className="h-9 text-xs"
            disabled={tx.phase === 'idle' && !txEnabled && !oneShot && !operatorState.tuning}
            onClick={operator.haltTx}
          >
            Halt TX
          </Button>
        </div>
        <div className="flex flex-wrap gap-px">
          <Toggle
            on={settings.autoSeq}
            title="Contesta solo siguiendo la secuencia del QSO"
            onClick={() => operator.updateSettings({ autoSeq: !settings.autoSeq })}
          >
            Auto secuencia
          </Toggle>
          <Toggle
            on={settings.callFirst}
            title="Tras tu CQ contesta sola a la primera estación que te llama"
            onClick={() => operator.updateSettings({ callFirst: !settings.callFirst })}
          >
            Call 1st
          </Toggle>
          <Toggle
            on={settings.holdTxFreq}
            title="Al contestar o mover el RX, el tono de TX se queda donde está"
            onClick={() => operator.updateSettings({ holdTxFreq: !settings.holdTxFreq })}
          >
            Hold Tx Freq
          </Toggle>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Mi secuencia</span>
          <span role="group" aria-label="Secuencia de transmisión" className="flex gap-px">
            <Toggle on={settings.txParity === 'even'} onClick={() => operator.updateSettings({ txParity: 'even' })}>
              Par :00/:30
            </Toggle>
            <Toggle on={settings.txParity === 'odd'} onClick={() => operator.updateSettings({ txParity: 'odd' })}>
              Impar :15/:45
            </Toggle>
          </span>
        </div>
        {waiting.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted">En espera:</span>
            {waiting.map((call, index) => (
              <span key={call} className="flex items-center bg-instrument font-mono">
                <span className="px-1.5">
                  {index === 0 ? '▶ ' : ''}
                  {call}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${call} de la espera`}
                  className="px-1 text-muted hover:text-fg"
                  onClick={() => operator.removeWaiting(call)}
                >
                  ×
                </button>
              </span>
            ))}
            <Button variant="tile" className="h-6 px-2 text-xs" onClick={operator.serveNextWaiting}>
              Atender primero →
            </Button>
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2">
          {operatorState.restored && <span className="text-xs text-meter">QSO recuperado</span>}
          <Button variant="navy" className="ml-auto h-8 px-3 text-xs" onClick={operator.prepareLog}>
            Guardar QSO…
          </Button>
        </div>
      </div>
    </section>
  )
}
