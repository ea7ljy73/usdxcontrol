import type { DigiMode } from './slots'

// Frecuencias de dial habituales (USB) por banda, las de WSJT-X por defecto.
const DIAL_HZ: Record<DigiMode, Record<string, number>> = {
  FT8: {
    '160m': 1_840_000,
    '80m': 3_573_000,
    '60m': 5_357_000,
    '40m': 7_074_000,
    '30m': 10_136_000,
    '20m': 14_074_000,
    '17m': 18_100_000,
    '15m': 21_074_000,
    '12m': 24_915_000,
    '10m': 28_074_000,
    '6m': 50_313_000,
  },
  FT4: {
    '80m': 3_575_000,
    '40m': 7_047_500,
    '30m': 10_140_000,
    '20m': 14_080_000,
    '17m': 18_104_000,
    '15m': 21_140_000,
    '12m': 24_919_000,
    '10m': 28_180_000,
    '6m': 50_318_000,
  },
}

export const digiDialHz = (mode: DigiMode, bandId: string): number | null => DIAL_HZ[mode][bandId] ?? null
