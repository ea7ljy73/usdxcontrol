// Escuchas de PSK Reporter: qué estaciones han decodificado nuestra señal, dónde y con
// qué SNR. Sirve para saber si la emisión sale y hasta dónde llega.
import { gridDistanceKm } from './grid'

export type PskSpot = {
  receiver: string
  locator: string
  country: string
  frequencyHz: number
  snrDb: number | null
  timeMs: number
  mode: string
}

// Lo que devuelve la API (atributos de <receptionReport>, en texto o número).
export type PskRawReport = Record<string, string | number | undefined>

const BANDS: [string, number, number][] = [
  ['160m', 1_800_000, 2_000_000],
  ['80m', 3_500_000, 4_000_000],
  ['60m', 5_250_000, 5_450_000],
  ['40m', 7_000_000, 7_300_000],
  ['30m', 10_100_000, 10_150_000],
  ['20m', 14_000_000, 14_350_000],
  ['17m', 18_068_000, 18_168_000],
  ['15m', 21_000_000, 21_450_000],
  ['12m', 24_890_000, 24_990_000],
  ['10m', 28_000_000, 29_700_000],
  ['6m', 50_000_000, 54_000_000],
  ['2m', 144_000_000, 148_000_000],
]

export const bandOf = (hz: number): string => BANDS.find(([, low, high]) => hz >= low && hz <= high)?.[0] ?? '—'

const num = (value: string | number | undefined): number | null => {
  if (value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Escuchas válidas, de la más reciente a la más antigua, sin repetir receptor y minuto. */
export const parsePskReports = (raw: readonly PskRawReport[]): PskSpot[] => {
  const seen = new Set<string>()
  const spots: PskSpot[] = []
  for (const report of raw) {
    const receiver = String(report.receiverCallsign ?? '').trim().toUpperCase()
    const seconds = num(report.flowStartSeconds)
    const frequencyHz = num(report.frequency)
    if (!receiver || seconds === null || frequencyHz === null) continue
    const key = `${receiver}|${Math.floor(seconds / 60)}|${Math.round(frequencyHz / 1_000)}`
    if (seen.has(key)) continue
    seen.add(key)
    spots.push({
      receiver,
      locator: String(report.receiverLocator ?? '').trim(),
      country: String(report.receiverDXCC ?? '').trim(),
      frequencyHz,
      snrDb: num(report.sNR),
      timeMs: seconds * 1_000,
      mode: String(report.mode ?? '').toUpperCase(),
    })
  }
  return spots.sort((a, b) => b.timeMs - a.timeMs)
}

export type PskSummary = { count: number; bestSnr: number | null; farthestKm: number | null; farthestCall: string | null }

/** Cuántos nos han oído, la mejor SNR y la escucha más lejana desde nuestro locator. */
export const summarizePsk = (spots: readonly PskSpot[], myGrid: string): PskSummary => {
  let bestSnr: number | null = null
  let farthestKm: number | null = null
  let farthestCall: string | null = null
  for (const spot of spots) {
    if (spot.snrDb !== null && (bestSnr === null || spot.snrDb > bestSnr)) bestSnr = spot.snrDb
    const km = myGrid && spot.locator ? gridDistanceKm(myGrid, spot.locator) : null
    if (km !== null && (farthestKm === null || km > farthestKm)) {
      farthestKm = km
      farthestCall = spot.receiver
    }
  }
  return { count: new Set(spots.map((spot) => spot.receiver)).size, bestSnr, farthestKm, farthestCall }
}
