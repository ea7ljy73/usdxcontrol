import { t } from '@/i18n/i18n'
import type { PskReporterSource } from '../application/ports'
import { parsePskReports, type PskRawReport, type PskSpot } from '../domain/pskReport'

// PSK Reporter no permite CORS: se consulta por JSONP (un <script> con callback), como en
// radiocq. Limita las consultas (unos minutos entre una y otra), así que se guardan los
// resultados y no se repite la consulta del mismo indicativo antes de MIN_INTERVAL_MS.
const ENDPOINT = 'https://retrieve.pskreporter.info/query'
const AGE_S = 3_600
const TIMEOUT_MS = 12_000
const MIN_INTERVAL_MS = 5 * 60_000

type Response = { receptionReport?: PskRawReport[]; receptionReports?: PskRawReport[] }

const jsonp = (url: string): Promise<Response> =>
  new Promise((resolve, reject) => {
    const name = `uSdxPsk${Date.now().toString(36)}${Math.floor(Math.random() * 1_000)}`
    const scope = window as unknown as Record<string, unknown>
    const script = document.createElement('script')
    const cleanup = () => {
      window.clearTimeout(timer)
      delete scope[name]
      script.remove()
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(t('errors.pskTimeout')))
    }, TIMEOUT_MS)
    scope[name] = (data: Response) => {
      cleanup()
      resolve(data)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error(t('errors.pskTimeout')))
    }
    script.src = `${url}&callback=${name}`
    document.head.appendChild(script)
  })

export const createPskReporterJsonp = (): PskReporterSource => {
  const cache = new Map<string, { atMs: number; spots: PskSpot[] }>()
  return {
    async spotsFor(callsign) {
      const call = callsign.trim().toUpperCase()
      if (!call) return []
      const cached = cache.get(call)
      if (cached && Date.now() - cached.atMs < MIN_INTERVAL_MS) return cached.spots
      const data = await jsonp(`${ENDPOINT}?senderCallsign=${encodeURIComponent(call)}&flowStartSeconds=-${AGE_S}&rronly=1&rptlimit=500`)
      const spots = parsePskReports(data.receptionReport ?? data.receptionReports ?? [])
      cache.set(call, { atMs: Date.now(), spots })
      return spots
    },
  }
}
