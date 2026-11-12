import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { resolveDxcc } from '../domain/dxcc'
import { txMessage, type QsoPhase } from '../domain/ft8qso'
import { gridDistanceKm } from '../domain/grid'
import { isValidCall, standardMessages } from '../domain/messages'
import { nextTxSlot, slotStartMs, TX_START_OFFSET_MS } from '../domain/slots'
import { useDigital, useUtcNow } from './useDigital'
import { useI18n } from '@/i18n/useI18n'
import { countryName } from '@/i18n/countries'

const PHASES = ['cq', 'call', 'report', 'roger', 'rr73', 'done'] as const satisfies readonly QsoPhase[]

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
  const { t } = useI18n()
  const { receiverState, operator, operatorState } = useDigital()
  const { settings, qso, dxCall, dxGrid, txEnabled, tx, waiting, oneShot } = operatorState
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
  const dxEntity = dxCall ? resolveDxcc(dxCall)?.entity : undefined
  const dxCountry = dxEntity ? countryName(dxEntity) : undefined
  const distance = dxGrid && settings.myGrid ? gridDistanceKm(settings.myGrid, dxGrid) : null
  const now = useUtcNow(500)
  const nextTxStart = slotStartMs(nextTxSlot(now, receiverState.mode, settings.txParity), receiverState.mode) + TX_START_OFFSET_MS
  const waitS = Math.max(0, Math.ceil((nextTxStart - now) / 1_000))
  const parityLabel = settings.txParity === 'odd' ? t('digital.qso.odd') : t('digital.qso.even')

  // Atajos de WSJT-X: Esc corta la emisión (Halt Tx) y Mayús + F11 / F12 baja o sube el TX.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (event.key === 'Escape') {
        // En un campo o un diálogo, Esc es para cancelar o cerrar.
        if (event.defaultPrevented || target?.closest('input, textarea, select, [role="dialog"]')) return
        operator.haltTx()
        return
      }
      if (!event.shiftKey || (event.key !== 'F11' && event.key !== 'F12')) return
      event.preventDefault()
      operator.nudgeTx(event.key === 'F12' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [operator])

  return (
    <section aria-label="QSO" className="grid gap-px bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5 bg-panel-deep p-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{t('digital.qso.dxStation')}</h2>
          <button
            type="button"
            data-testid="digi-my-station"
            className="ml-auto font-mono text-xs text-muted hover:text-fg"
            title={t('digital.qso.myStation')}
            onClick={onOpenSettings}
          >
            {settings.myCall ? `${settings.myCall} · ${settings.myGrid || '----'}` : t('digital.qso.setupCall')}
          </button>
        </div>
        {!isValidCall(settings.myCall) && (
          <p role="alert" className="flex items-center gap-2 bg-instrument px-2 py-1 text-xs text-slice">
            {t('digital.qso.needCall')}
            <Button variant="navy" className="ml-auto h-6 px-2 text-xs" onClick={onOpenSettings}>
              {t('digital.toolbar.settings')}
            </Button>
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Field label={t('digital.qso.dxCall')} hint={dxCountry}>
            <CommitInput
              placeholder="—"
              value={dxCall}
              onCommit={(value) => operator.setDx(value, dxGrid)}
              className="font-mono uppercase"
            />
          </Field>
          <Field label={t('digital.qso.dxGrid')} hint={distance !== null ? `${distance} km` : undefined}>
            <CommitInput
              placeholder="—"
              value={dxGrid}
              onCommit={(value) => operator.setDx(dxCall, value)}
              className="font-mono uppercase"
            />
          </Field>
          <Field label={t('digital.qso.freeText')} hint={t('digital.qso.freeTextHint')} className="col-span-2">
            <CommitInput
              placeholder={t('digital.qso.automatic')}
              maxLength={37}
              value={operatorState.txOverride}
              onCommit={(value) => operator.setTxOverride(value)}
              className="font-mono uppercase"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="tile" className="h-8 px-2 text-xs" disabled={!dxCall} onClick={operator.callDx}>
            {t('digital.qso.callDx')}
          </Button>
          <Button variant="tile" className="h-8 px-2 text-xs" disabled={!dxCall} onClick={() => operator.addWaiting()}>
            {t('digital.qso.addWaiting')}
          </Button>
          <Button variant="tile" className="h-8 px-2 text-xs" onClick={operator.resetQso}>
            {t('digital.qso.clearDx')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 bg-panel-deep p-2">
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{t('digital.qso.messages')}</h2>
        <ol className="flex flex-col gap-1">
          {messages.map((message, index) => (
            <li key={message.id} className="flex items-center gap-1">
              <span className="w-9 shrink-0 bg-instrument px-1 py-1 text-center font-mono text-xs text-muted">Tx{index + 1}</span>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate bg-instrument px-2 py-1 font-mono text-xs',
                  message.text && message.text === nextMessage ? 'text-slice' : 'text-fg',
                  !message.text && 'text-muted',
                )}
              >
                {message.text ?? t('digital.qso.missingCall', { label: t(`digital.qso.std.${message.id}`) })}
              </span>
              <Button
                variant="tile"
                aria-label={t('digital.qso.sendAria', { n: index + 1, label: t(`digital.qso.std.${message.id}`) })}
                className="h-6 px-2 text-xs"
                disabled={!message.text}
                onClick={() => operator.sendStandard(message.id)}
              >
                {t('digital.qso.send')}
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-1" aria-label={t('digital.qso.sequence')}>
          {PHASES.map((phase) => (
            <span
              key={phase}
              data-active={qso.phase === phase}
              className={cn(
                'px-1.5 py-0.5 text-[11px]',
                qso.phase === phase ? 'bg-slice text-instrument' : 'bg-instrument text-muted',
              )}
            >
              {t(`digital.qso.phase.${phase}`)}
            </span>
          ))}
          <span data-testid="digi-qso-phase" className="sr-only">
            {qso.phase}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="tile" className="h-7 px-2 text-xs" onClick={operator.advancePhase}>
            {t('digital.qso.nextStep')}
          </Button>
          <Button variant="tile" className="h-7 px-2 text-xs" onClick={operator.restartSequence}>
            {t('digital.qso.restart')}
          </Button>
          <Button variant="tile" className="h-7 px-2 text-xs" onClick={operator.sendNow}>
            {t('digital.qso.sendNow')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 bg-panel-deep p-2">
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{t('digital.qso.transmission')}</h2>
        <div
          data-testid="digi-tx-status"
          className={cn(
            'min-h-8 bg-instrument px-2 py-1 font-mono text-xs',
            tx.phase === 'on-air' || operatorState.tuning ? 'text-error' : 'text-muted',
          )}
        >
          {operatorState.tuning
            ? t('digital.qso.tuning', { hz: settings.toneHz })
            : tx.phase === 'on-air'
              ? `TX ▶ ${tx.message}`
              : tx.phase === 'scheduled'
                ? t('digital.qso.scheduled', { message: tx.message ?? '' })

                : nextMessage && (txEnabled || oneShot)
                  ? t('digital.qso.next', { parity: parityLabel, seconds: waitS, message: nextMessage })
                  : t('digital.qso.noTx')}
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 [&>button]:px-1 [&>button]:whitespace-nowrap">
          <Button
            data-testid="digi-enable-tx"
            variant={txEnabled ? 'navy' : 'tile'}
            aria-pressed={txEnabled}
            className={cn('h-9 text-xs', txEnabled && 'text-error aria-pressed:text-tx-fg aria-pressed:bg-tx')}
            onClick={() => operator.setTxEnabled(!txEnabled)}
          >
            {t('digital.qso.enableTx')}
          </Button>
          <Button variant="tile" className="h-9 text-xs" onClick={operator.callCq}>
            {t('digital.qso.callCq')}
          </Button>
          <Button
            variant={operatorState.tuning ? 'navy' : 'tile'}
            aria-pressed={operatorState.tuning}
            title={t('digital.qso.tuneTitle')}
            className={cn('h-9 text-xs', operatorState.tuning && 'text-error aria-pressed:text-tx-fg aria-pressed:bg-tx')}
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
        <div className="flex flex-wrap gap-1">
          <Toggle
            on={settings.autoSeq}
            title={t('digital.qso.autoSeqTitle')}
            onClick={() => operator.updateSettings({ autoSeq: !settings.autoSeq })}
          >
            {t('digital.qso.autoSeq')}
          </Toggle>
          <Toggle
            on={settings.callFirst}
            title={t('digital.qso.callFirstTitle')}
            onClick={() => operator.updateSettings({ callFirst: !settings.callFirst })}
          >
            Call 1st
          </Toggle>
          <Toggle
            on={settings.holdTxFreq}
            title={t('digital.qso.holdTxTitle')}
            onClick={() => operator.updateSettings({ holdTxFreq: !settings.holdTxFreq })}
          >
            Hold Tx Freq
          </Toggle>
          <Toggle
            on={settings.autoClearTx}
            title={t('digital.qso.autoClearTitle')}
            onClick={() => operator.updateSettings({ autoClearTx: !settings.autoClearTx })}
          >
            {t('digital.qso.autoClear')}
          </Toggle>
          <Button
            variant="tile"
            className="h-8 px-2 text-xs"
            title={t('digital.qso.txFromRx', { hz: settings.rxHz })}
            onClick={() => operator.setTxHz(settings.rxHz)}
          >
            Tx←Rx
          </Button>
          <Button
            variant="tile"
            className="h-8 px-2 text-xs"
            title={t('digital.qso.rxFromTx', { hz: settings.toneHz })}
            onClick={() => operator.setRxHz(settings.toneHz)}
          >
            Rx←Tx
          </Button>
          <Button
            data-testid="digi-find-clear"
            variant="tile"
            className="h-8 px-2 text-xs"
            title={t('digital.qso.findClearTitle')}
            onClick={operator.findClearTx}
          >
            {t('digital.qso.findClear')}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{t('digital.qso.mySequence')}</span>
          <span role="group" aria-label={t('digital.qso.txSequence')} className="flex gap-1">
            <Toggle on={settings.txParity === 'even'} onClick={() => operator.updateSettings({ txParity: 'even' })}>
              {t('digital.qso.evenSlots')}
            </Toggle>
            <Toggle on={settings.txParity === 'odd'} onClick={() => operator.updateSettings({ txParity: 'odd' })}>
              {t('digital.qso.oddSlots')}
            </Toggle>
          </span>
        </div>
        {waiting.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted">{t('digital.qso.waiting')}</span>
            {waiting.map((call, index) => (
              <span key={call} className="flex items-center bg-instrument font-mono">
                <span className="px-1.5">
                  {index === 0 ? '▶ ' : ''}
                  {call}
                </span>
                <button
                  type="button"
                  aria-label={t('digital.qso.removeWaiting', { call })}
                  className="px-1 text-muted hover:text-fg"
                  onClick={() => operator.removeWaiting(call)}
                >
                  ×
                </button>
              </span>
            ))}
            <Button variant="tile" className="h-6 px-2 text-xs" onClick={operator.serveNextWaiting}>
              {t('digital.qso.serveFirst')}
            </Button>
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2">
          {operatorState.restored && <span className="text-xs text-meter">{t('digital.qso.restored')}</span>}
          <Button variant="navy" className="ml-auto h-8 px-3 text-xs" onClick={operator.prepareLog}>
            {t('digital.qso.saveQso')}

          </Button>
        </div>
      </div>
    </section>
  )
}
