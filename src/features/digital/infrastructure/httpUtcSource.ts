import { t } from '@/i18n/i18n'
import type { UtcSource } from '../application/ports'

// Hora UTC de servidores públicos (los mismos que radiocq), probando uno tras otro.
const SOURCES: (() => Promise<number>)[] = [
  async () => {
    const response = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const t = (await response.json()) as { year: number; month: number; day: number; hour: number; minute: number; seconds: number; milliSeconds: number }
    return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.seconds, t.milliSeconds)
  },
  async () => {
    const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const t = (await response.json()) as { utc_datetime: string }
    return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(t.utc_datetime) ? t.utc_datetime : `${t.utc_datetime}Z`).getTime()
  },
]

export const httpUtcSource: UtcSource = {
  async fetchUtcMs() {
    for (const source of SOURCES) {
      try {
        return await source()
      } catch {
        // siguiente servidor
      }
    }
    throw new Error(t('digital.toolbar.utcFailed'))

  },
}
