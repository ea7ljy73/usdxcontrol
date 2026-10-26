import type { LogEntry } from '../domain/logbook'
import type { KeyValueStore, LogbookRepository } from '../application/ports'

// Ajustes, QSO en curso y libro de guardia en el almacenamiento local del navegador.
export const localStore: KeyValueStore = {
  get<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(`usdx.${key}`)
      return raw === null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(`usdx.${key}`, JSON.stringify(value))
    } catch {
      // almacenamiento lleno o bloqueado: se sigue sin persistir
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(`usdx.${key}`)
    } catch {
      // nada que borrar
    }
  },
}

export const localLogbook: LogbookRepository = {
  list: () => localStore.get<LogEntry[]>('digi.logbook') ?? [],
  save: (entries) => localStore.set('digi.logbook', entries),
}
