import { t } from '@/i18n/i18n'
import { logEntriesToAdif, logEntryToAdif } from '@/features/digital/domain/adif'
import type { LogEntry } from '@/features/digital/domain/logbook'
import type { IntegrationService, IntegrationUploadRequest, IntegrationUploadResult } from '@/types/integrations'
import {
  DEFAULT_INTEGRATIONS_CONFIG,
  SERVICE_NAMES,
  type DeliveryItem,
  type IntegrationsConfig,
  type LogSyncState,
  type ServiceConfig,
} from '../domain/types'
import type { IntegrationsBridge, KeyValueStore } from './ports'

const CONFIG_KEY = 'integrations.config'
const OUTBOX_KEY = 'integrations.outbox'
const SENT_KEEP_MS = 7 * 24 * 3_600_000
const TICK_MS = 15_000

type Options = {
  bridge: IntegrationsBridge
  store: KeyValueStore
  autoStart?: boolean
  now?: () => number
}

type Notifier = (text: string, tone: 'info' | 'success' | 'error') => void

type Outcome = {
  ok: boolean
  duplicate: boolean
  permanent: boolean
  message: string | null
  firstAttempt: boolean
}

const loadConfig = (store: KeyValueStore): IntegrationsConfig => {
  const stored = store.get<Partial<IntegrationsConfig>>(CONFIG_KEY)
  const saved = typeof stored?.services === 'object' && stored.services !== null ? stored.services : null
  const services = {} as IntegrationsConfig['services']
  for (const service of Object.keys(DEFAULT_INTEGRATIONS_CONFIG.services) as IntegrationService[]) {
    const stored = saved?.[service]
    services[service] = {
      ...DEFAULT_INTEGRATIONS_CONFIG.services[service],
      ...(typeof stored === 'object' && stored !== null ? stored : {}),
    }
  }
  return { services }
}

const prune = (items: DeliveryItem[], now: number): DeliveryItem[] =>
  items.filter((item) => (item.state !== 'sent' && item.state !== 'duplicate') || now - item.updatedAt < SENT_KEEP_MS)

const backoffMs = (attempts: number): number => Math.min(15_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 6), 3_600_000)

const requestConfig = (config: ServiceConfig, entry?: LogEntry): IntegrationUploadRequest['config'] => ({
  callsign: config.callsign || entry?.myCall || '',
  username: config.username || entry?.myCall || '',
  qthNickname: config.qthNickname,
  stationLocation: config.stationLocation,
  tqslPath: config.tqslPath || undefined,
})

const itemKey = (qsoId: string, service: IntegrationService) => `${qsoId}::${service}`

export const createLogSync = ({ bridge, store, autoStart = true, now = () => Date.now() }: Options) => {
  const loaded = store.get<DeliveryItem[]>(OUTBOX_KEY)
  const loadedItems = Array.isArray(loaded) ? loaded : []
  let state: LogSyncState = {
    config: loadConfig(store),
    items: prune(loadedItems, now()),
    sending: { qrz: false, clublog: false, lotw: false, eqsl: false },
    available: bridge.available,
    secureStorage: null,
  }
  const listeners = new Set<() => void>()
  let notifier: Notifier | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let onlineHandler: (() => void) | null = null

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const persistItems = (items: DeliveryItem[]) => {
    const next = prune(items, now())
    state = { ...state, items: next }
    store.set(OUTBOX_KEY, next)
    emit()
  }

  const setSending = (service: IntegrationService, sending: boolean) => {
    state = { ...state, sending: { ...state.sending, [service]: sending } }
    emit()
  }

  const notify = (text: string, tone: 'info' | 'success' | 'error') => {
    notifier?.(text, tone)
  }

  const notifyOutcome = (service: IntegrationService, count: number, outcome: Outcome, firstCall: string) => {
    const name = SERVICE_NAMES[service]
    if (!outcome.ok) {
      if (outcome.permanent) {
        notify(t('integrations.notices.blocked', { service: name, error: outcome.message ?? '' }), 'error')
      } else if (outcome.firstAttempt) {
        notify(t('integrations.notices.error', { service: name, error: outcome.message ?? '' }), 'error')
      }
      return
    }
    if (outcome.duplicate) {
      notify(
        count > 1
          ? t('integrations.notices.duplicateMany', { count, service: name })
          : t('integrations.notices.duplicate', { call: firstCall, service: name }),
        'success',
      )
      return
    }
    notify(
      count > 1
        ? t('integrations.notices.sentMany', { count, service: name })
        : t('integrations.notices.sent', { call: firstCall, service: name }),
      'success',
    )
  }

  const applyResult = (items: DeliveryItem[], result: IntegrationUploadResult): Outcome => {
    const keys = new Set(items.map((item) => itemKey(item.qsoId, item.service)))
    const at = now()
    let firstAttempt = false
    const updated = state.items.map((item) => {
      if (!keys.has(itemKey(item.qsoId, item.service))) return item
      if (result.ok) {
        return {
          ...item,
          state: result.duplicate ? ('duplicate' as const) : ('sent' as const),
          attempts: item.attempts + 1,
          lastError: null,
          updatedAt: at,
        }
      }
      const attempts = item.attempts + 1
      if (attempts === 1) firstAttempt = true
      const permanent = result.permanent === true
      return {
        ...item,
        state: permanent ? ('blocked' as const) : ('error' as const),
        attempts,
        nextAttemptAt: permanent ? Number.MAX_SAFE_INTEGER : at + (result.retryAfterMs ?? backoffMs(attempts)),
        lastError: result.message ?? t('integrations.errors.unknown'),
        updatedAt: at,
      }
    })
    persistItems(updated)
    return {
      ok: result.ok,
      duplicate: result.duplicate === true,
      permanent: result.permanent === true,
      message: result.message ?? null,
      firstAttempt,
    }
  }

  const dueItems = (service: IntegrationService, force: boolean): DeliveryItem[] => {
    const at = now()
    return state.items.filter(
      (item) =>
        item.service === service &&
        (item.state === 'pending' || item.state === 'error' || (force && item.state === 'blocked')) &&
        (force || item.nextAttemptAt <= at),
    )
  }

  const uploadRequest = (service: IntegrationService, adif: string, entry?: LogEntry): IntegrationUploadRequest => ({
    service,
    adif,
    config: requestConfig(state.config.services[service], entry),
  })

  const flush = async (service: IntegrationService, force = false): Promise<void> => {
    const config = state.config.services[service]
    if (!config.enabled || config.mode === 'off' || state.sending[service]) return
    const due = dueItems(service, force)
    if (due.length === 0) return

    setSending(service, true)
    try {
      if (service === 'qrz') {
        let outcome: Outcome = {
          ok: true,
          duplicate: false,
          permanent: false,
          message: null,
          firstAttempt: false,
        }
        for (let index = 0; index < due.length; index += 1) {
          const item = due[index]
          const result = await bridge.upload(uploadRequest(service, logEntryToAdif(item.snapshot), item.snapshot))
          outcome = applyResult([item], result)
          if (!result.ok && result.permanent) {
            if (index + 1 < due.length) applyResult(due.slice(index + 1), result)
            break
          }
        }
        notifyOutcome(service, due.length, outcome, due[0].snapshot.call)
        return
      }

      const result = await bridge.upload(uploadRequest(service, logEntriesToAdif(due.map((item) => item.snapshot)), due[0].snapshot))
      const outcome = applyResult(due, result)
      notifyOutcome(service, due.length, outcome, due[0].snapshot.call)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const outcome = applyResult(due, { ok: false, permanent: false, message })
      notifyOutcome(service, due.length, outcome, due[0].snapshot.call)
    } finally {
      setSending(service, false)
    }
  }

  const enqueue = (entry: LogEntry) => {
    if (!state.available) return
    const at = now()
    const added: DeliveryItem[] = []
    for (const service of Object.keys(state.config.services) as IntegrationService[]) {
      const config = state.config.services[service]
      if (!config.enabled || config.mode === 'off') continue
      if (state.items.some((item) => item.qsoId === entry.id && item.service === service)) continue
      added.push({
        qsoId: entry.id,
        service,
        snapshot: entry,
        state: 'pending',
        attempts: 0,
        nextAttemptAt: config.mode === 'scheduled' ? at + Math.max(config.intervalMinutes, 1) * 60_000 : at,
        lastError: null,
        updatedAt: at,
      })
    }
    if (added.length === 0) return
    persistItems([...state.items, ...added])
    const instant = new Set(added.filter((item) => state.config.services[item.service].mode === 'instant').map((item) => item.service))
    for (const service of instant) queueMicrotask(() => void flush(service))
  }

  const updateConfig = (next: IntegrationsConfig) => {
    const previous = state.config
    const at = now()
    const reset = new Set<IntegrationService>()
    let items = state.items

    for (const service of Object.keys(next.services) as IntegrationService[]) {
      const before = previous.services[service]
      const after = next.services[service]
      if (before.enabled && !after.enabled) {
        items = items.filter(
          (item) => item.service !== service || item.state === 'sent' || item.state === 'duplicate',
        )
        continue
      }
      if (JSON.stringify(before) === JSON.stringify(after)) continue
      reset.add(service)
    }

    if (reset.size > 0) {
      items = items.map((item) =>
        reset.has(item.service) && (item.state === 'blocked' || item.state === 'error')
          ? { ...item, state: 'pending', nextAttemptAt: at, lastError: null }
          : item,
      )
    }

    state = { ...state, config: next, items }
    store.set(CONFIG_KEY, next)
    store.set(OUTBOX_KEY, items)
    emit()

    for (const service of reset) {
      if (next.services[service].enabled && next.services[service].mode === 'instant') {
        queueMicrotask(() => void flush(service))
      }
    }
  }

  const syncNow = async () => {
    for (const service of Object.keys(state.config.services) as IntegrationService[]) {
      await flush(service, true)
    }
  }

  const retryService = (service: IntegrationService) => {
    const at = now()
    persistItems(
      state.items.map((item) =>
        item.service === service && (item.state === 'blocked' || item.state === 'error')
          ? { ...item, state: 'pending', nextAttemptAt: at, lastError: null }
          : item,
      ),
    )
  }

  const setSecret = async (service: IntegrationService, value: string) => {
    if (value.trim() === '') await bridge.clearSecret(service)
    else await bridge.setSecret(service, value)
    retryService(service)
    if (state.config.services[service].enabled) queueMicrotask(() => void flush(service))
  }

  const test = (service: IntegrationService): Promise<IntegrationUploadResult> =>
    bridge.test({
      service,
      adif: '',
      config: requestConfig(state.config.services[service]),
    })

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const start = () => {
    if (!autoStart) return
    void bridge
      .secureStorage()
      .then((info) => {
        state = { ...state, secureStorage: info.available }
        emit()
      })
      .catch(() => {
        state = { ...state, secureStorage: false }
        emit()
      })
    timer = setInterval(() => {
      for (const service of Object.keys(state.config.services) as IntegrationService[]) {
        const config = state.config.services[service]
        if (config.enabled && config.mode === 'scheduled') void flush(service)
      }
    }, TICK_MS)
    queueMicrotask(() => {
      for (const service of Object.keys(state.config.services) as IntegrationService[]) {
        if (state.config.services[service].enabled) void flush(service)
      }
    })
    if (typeof window !== 'undefined') {
      onlineHandler = () => void syncNow()
      window.addEventListener('online', onlineHandler)
    }
  }

  const dispose = () => {
    if (timer !== null) clearInterval(timer)
    if (onlineHandler !== null && typeof window !== 'undefined') window.removeEventListener('online', onlineHandler)
    timer = null
    onlineHandler = null
    listeners.clear()
  }

  start()

  return {
    enqueue,
    updateConfig,
    syncNow,
    flushService: (service: IntegrationService, force = false) => flush(service, force),
    retryService,
    setSecret,
    hasSecret: (service: IntegrationService) => bridge.hasSecret(service),
    clearSecret: (service: IntegrationService) => bridge.clearSecret(service),
    test,
    detectTqsl: () => bridge.detectTqsl(),
    pickTqsl: () => bridge.pickTqsl(),
    setNotifier: (next: Notifier | null) => {
      notifier = next
    },
    subscribe,
    getState: () => state,
    dispose,
  }
}

export type LogSync = ReturnType<typeof createLogSync>