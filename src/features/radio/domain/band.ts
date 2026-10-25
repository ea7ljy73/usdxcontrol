export type Band = {
  id: string
  label: string
  fromHz: number
  toHz: number
  defaultFreqHz: number
}

export const BANDS: Band[] = [
  { id: '160m', label: '160m', fromHz: 1_800_000, toHz: 2_000_000, defaultFreqHz: 1_842_000 },
  { id: '80m', label: '80m', fromHz: 3_500_000, toHz: 4_000_000, defaultFreqHz: 3_573_000 },
  { id: '40m', label: '40m', fromHz: 7_000_000, toHz: 7_300_000, defaultFreqHz: 7_074_000 },
  { id: '30m', label: '30m', fromHz: 10_100_000, toHz: 10_150_000, defaultFreqHz: 10_136_000 },
  { id: '20m', label: '20m', fromHz: 14_000_000, toHz: 14_350_000, defaultFreqHz: 14_074_000 },
  { id: '17m', label: '17m', fromHz: 18_068_000, toHz: 18_168_000, defaultFreqHz: 18_100_000 },
  { id: '15m', label: '15m', fromHz: 21_000_000, toHz: 21_450_000, defaultFreqHz: 21_074_000 },
  { id: '12m', label: '12m', fromHz: 24_890_000, toHz: 24_990_000, defaultFreqHz: 24_915_000 },
  { id: '10m', label: '10m', fromHz: 28_000_000, toHz: 29_700_000, defaultFreqHz: 28_074_000 },
]

export const bandFromFrequency = (freq: number): Band | null =>
  BANDS.find((band) => freq >= band.fromHz && freq <= band.toHz) ?? null
