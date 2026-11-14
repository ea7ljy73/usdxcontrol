import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useContainer } from '@/app/container'
import { Button } from '@/components/ui/button'
import { Field, Select, TextInput } from '@/components/ui/field'
import { useI18n } from '@/i18n/useI18n'
import type { IntegrationService } from '@/types/integrations'
import {
  SCHEDULE_INTERVALS,
  SERVICE_NAMES,
  type DeliveryItem,
  type DeliveryMode,
  type ServiceConfig,
} from '../domain/types'

const SERVICES: IntegrationService[] = ['lotw', 'clublog', 'qrz', 'eqsl']

const statusTone = (item: DeliveryItem): string =>
  item.state === 'blocked' || item.state === 'error'
    ? 'text-error'
    : item.state === 'sent' || item.state === 'duplicate'
      ? 'text-rx'
      : 'text-slice'

const utc = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace('T', ' ')

const CompositeField = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-0.5 text-xs text-muted">
    <span className="flex items-baseline justify-between gap-2">
      {label}
      {hint && <span className="truncate text-muted">{hint}</span>}
    </span>
    {children}
  </div>
)

export function IntegrationsPanel() {
  const { t } = useI18n()
  const { integrations } = useContainer()
  const state = useSyncExternalStore(integrations.subscribe, integrations.getState, integrations.getState)
  const [secrets, setSecrets] = useState<Partial<Record<IntegrationService, boolean>>>({})
  const [secretInputs, setSecretInputs] = useState<Partial<Record<IntegrationService, string>>>({})
  const [testing, setTesting] = useState<Partial<Record<IntegrationService, boolean>>>({})
  const [results, setResults] = useState<Partial<Record<IntegrationService, { text: string; tone: 'success' | 'error' }>>>({})

  const refreshSecrets = () => {
    for (const service of SERVICES) {
      void integrations.hasSecret(service).then((stored) => setSecrets((current) => ({ ...current, [service]: stored })))
    }
  }

  useEffect(refreshSecrets, [integrations])

  const patch = (service: IntegrationService, next: Partial<ServiceConfig>) => {
    integrations.updateConfig({
      services: { ...state.config.services, [service]: { ...state.config.services[service], ...next } },
    })
  }

  const setMode = (service: IntegrationService, mode: DeliveryMode) => {
    patch(service, { mode, enabled: mode !== 'off' })
  }

  const saveSecret = async (service: IntegrationService) => {
    const value = secretInputs[service] ?? ''
    if (value.trim() === '') return
    try {
      await integrations.setSecret(service, value)
      setSecretInputs((current) => ({ ...current, [service]: '' }))
      setSecrets((current) => ({ ...current, [service]: true }))
      setResults((current) => ({ ...current, [service]: { text: t('integrations.secretStored'), tone: 'success' } }))
    } catch (cause) {
      setResults((current) => ({
        ...current,
        [service]: { text: cause instanceof Error ? cause.message : String(cause), tone: 'error' },
      }))
    }
  }

  const clearSecret = async (service: IntegrationService) => {
    try {
      await integrations.clearSecret(service)
      setSecrets((current) => ({ ...current, [service]: false }))
    } catch (cause) {
      setResults((current) => ({
        ...current,
        [service]: { text: cause instanceof Error ? cause.message : String(cause), tone: 'error' },
      }))
    }
  }

  const runTest = async (service: IntegrationService) => {
    setTesting((current) => ({ ...current, [service]: true }))
    try {
      const result = await integrations.test(service)
      setResults((current) => ({
        ...current,
        [service]: { text: result.message ?? (result.ok ? t('integrations.test') : t('integrations.errors.unknown')), tone: result.ok ? 'success' : 'error' },
      }))
    } catch (cause) {
      setResults((current) => ({
        ...current,
        [service]: { text: cause instanceof Error ? cause.message : String(cause), tone: 'error' },
      }))
    } finally {
      setTesting((current) => ({ ...current, [service]: false }))
    }
  }

  const itemsFor = (service: IntegrationService) => state.items.filter((item) => item.service === service)
  const pendingFor = (service: IntegrationService) =>
    itemsFor(service).filter((item) => item.state === 'pending' || item.state === 'error' || item.state === 'blocked')
  const sentFor = (service: IntegrationService) =>
    itemsFor(service).filter((item) => item.state === 'sent' || item.state === 'duplicate')
  const lastError = (service: IntegrationService) =>
    [...itemsFor(service)].reverse().find((item) => item.lastError)?.lastError ?? null

  const recent = [...state.items]
    .filter((item) => item.state !== 'sent' && item.state !== 'duplicate')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)

  return (
    <div data-testid="integrations-panel" className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t('integrations.description')}</p>
      {!state.available && (
        <p role="alert" className="border border-error/40 bg-error/10 px-2 py-1 text-xs text-error">
          {t('integrations.desktopOnly')}
        </p>
      )}
      <p className="text-xs text-muted">
        {state.secureStorage === false ? t('integrations.secureUnavailable') : t('integrations.secureAvailable')}
      </p>

      <div className="grid gap-2 lg:grid-cols-2">
        {SERVICES.map((service) => {
          const config = state.config.services[service]
          const pending = pendingFor(service)
          const sent = sentFor(service)
          const error = lastError(service)
          const result = results[service]
          const stored = secrets[service] === true
          const isEqsl = service === 'eqsl'
          const isLotw = service === 'lotw'
          const isClubLog = service === 'clublog'

          return (
            <section key={service} data-testid={`integration-${service}`} className="flex flex-col gap-2 border border-line bg-panel p-2">
              <header className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-meter"
                    checked={config.enabled}
                    onChange={(event) =>
                      patch(service, {
                        enabled: event.target.checked,
                        mode: event.target.checked && config.mode === 'off' ? (isLotw || isClubLog ? 'scheduled' : 'instant') : config.mode,
                      })
                    }
                  />
                  {SERVICE_NAMES[service]}
                </label>
                <span className="text-[11px] text-muted">
                  {t('integrations.queueSummary', { pending: pending.length, sent: sent.length })}
                </span>
              </header>

              <div className="grid grid-cols-2 gap-2">
                <Field label={t('integrations.mode')}>
                  <Select value={config.mode} onChange={(event) => setMode(service, event.target.value as DeliveryMode)}>
                    <option value="off">{t('integrations.modeOff')}</option>
                    <option value="instant">{t('integrations.modeInstant')}</option>
                    <option value="scheduled">{t('integrations.modeScheduled')}</option>
                  </Select>
                </Field>
                {config.mode === 'scheduled' && (
                  <Field label={t('integrations.interval')}>
                    <Select
                      value={config.intervalMinutes}
                      onChange={(event) => patch(service, { intervalMinutes: Number(event.target.value) })}
                    >
                      {SCHEDULE_INTERVALS.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {t('integrations.minutes', { count: minutes })}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>

              {isClubLog && (
                <Field label={t('integrations.callsign')} hint={t('integrations.clublogCallsignHint')}>
                  <TextInput
                    value={config.callsign}
                    placeholder="EA7LJY"
                    onChange={(event) => patch(service, { callsign: event.target.value.toUpperCase() })}
                  />
                </Field>
              )}

              {isEqsl && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t('integrations.username')}>
                    <TextInput
                      value={config.username}
                      placeholder="EA7LJY"
                      onChange={(event) => patch(service, { username: event.target.value.toUpperCase() })}
                    />
                  </Field>
                  <Field label={t('integrations.qthNickname')} hint={t('integrations.eqslNicknameHint')}>
                    <TextInput
                      value={config.qthNickname}
                      onChange={(event) => patch(service, { qthNickname: event.target.value })}
                    />
                  </Field>
                </div>
              )}

              {isLotw && (
                <>
                  <Field label={t('integrations.stationLocation')} hint={t('integrations.stationLocationHint')}>
                    <TextInput
                      value={config.stationLocation}
                      onChange={(event) => patch(service, { stationLocation: event.target.value })}
                    />
                  </Field>
                  <CompositeField label={t('integrations.tqslPath')} hint={t('integrations.tqslPathHint')}>
                    <div className="flex gap-1">
                      <TextInput value={config.tqslPath} onChange={(event) => patch(service, { tqslPath: event.target.value })} />
                      <Button
                        variant="tile"
                        className="h-8 shrink-0 px-2 text-xs"
                        disabled={!state.available}
                        onClick={() => void integrations.detectTqsl().then((found) => found && patch(service, { tqslPath: found }))}
                      >
                        {t('integrations.detectTqsl')}
                      </Button>
                      <Button
                        variant="tile"
                        className="h-8 shrink-0 px-2 text-xs"
                        disabled={!state.available}
                        onClick={() => void integrations.pickTqsl().then((found) => found && patch(service, { tqslPath: found }))}
                      >
                        {t('integrations.pickTqsl')}
                      </Button>
                    </div>
                  </CompositeField>
                </>
              )}

              <CompositeField
                label={t('integrations.secret')}
                hint={stored ? t('integrations.secretStored') : isEqsl || isLotw ? t('integrations.secretHintPassword') : t('integrations.secretHintToken')}
              >
                <div className="flex gap-1">
                  <TextInput
                    type="password"
                    autoComplete="off"
                    value={secretInputs[service] ?? ''}
                    placeholder={stored ? '••••••••' : ''}
                    onChange={(event) => setSecretInputs((current) => ({ ...current, [service]: event.target.value }))}
                  />
                  <Button
                    variant="tile"
                    className="h-8 shrink-0 px-2 text-xs"
                    disabled={!state.available || (secretInputs[service] ?? '').trim() === ''}
                    onClick={() => void saveSecret(service)}
                  >
                    {t('integrations.saveSecret')}
                  </Button>
                  <Button
                    variant="tile"
                    className="h-8 shrink-0 px-2 text-xs"
                    disabled={!state.available || !stored}
                    onClick={() => void clearSecret(service)}
                  >
                    {t('integrations.clearSecret')}
                  </Button>
                </div>
              </CompositeField>

              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="tile"
                  className="h-7 px-2 text-xs"
                  disabled={!state.available || testing[service] === true}
                  onClick={() => void runTest(service)}
                >
                  {testing[service] === true ? t('integrations.testing') : t('integrations.test')}
                </Button>
                <Button
                  variant="tile"
                  className="h-7 px-2 text-xs"
                  disabled={!state.available || !config.enabled || pending.length === 0}
                  onClick={() => void integrations.flushService(service, true)}
                >
                  {t('integrations.sendNow')}
                </Button>
                {error && (
                  <Button
                    variant="tile"
                    className="h-7 px-2 text-xs"
                    disabled={!state.available}
                    onClick={() => integrations.retryService(service)}
                  >
                    {t('integrations.retry')}
                  </Button>
                )}
              </div>

              {result && (
                <p role="status" className={`text-xs ${result.tone === 'success' ? 'text-rx' : 'text-error'}`}>
                  {result.text}
                </p>
              )}
              {error && (
                <p className="text-xs text-error">
                  {t('integrations.lastError')}: {error}
                </p>
              )}
              {!config.enabled && <p className="text-xs text-muted">{t('integrations.notConfigured')}</p>}
            </section>
          )
        })}
      </div>

      <section className="border-t border-line pt-2">
        <h3 className="text-xs font-medium text-muted">{t('integrations.queue')}</h3>
        {recent.length === 0 ? (
          <p className="py-2 text-xs text-muted">{t('integrations.noQueue')}</p>
        ) : (
          <table className="mt-1 w-full font-mono text-xs">
            <tbody>
              {recent.map((item) => (
                <tr key={`${item.qsoId}-${item.service}`} className="odd:bg-panel-deep">
                  <td className="px-1 py-0.5 whitespace-nowrap text-muted">{utc(item.updatedAt)}</td>
                  <td className="px-1 py-0.5">{item.snapshot.call}</td>
                  <td className="px-1 py-0.5">{SERVICE_NAMES[item.service]}</td>
                  <td className={`px-1 py-0.5 ${statusTone(item)}`}>
                    {item.state === 'pending'
                      ? t('integrations.pending')
                      : item.state === 'blocked'
                        ? t('integrations.blocked')
                        : item.state === 'error'
                          ? t('integrations.error')
                          : item.state === 'duplicate'
                            ? t('integrations.duplicate')
                            : t('integrations.sent')}
                  </td>
                  <td className="max-w-48 truncate px-1 py-0.5 font-sans text-muted">{item.lastError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}