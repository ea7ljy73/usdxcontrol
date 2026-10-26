// Dónde sintonizar el SDR para cubrir lo que muestra el panadaptador.
//
// El RTL-SDR ve (casi) todo su ancho de muestreo; los bordes caen por el filtro
// antialias, así que solo se usa la parte central. Si la banda cabe entera, el SDR se
// queda en su centro y no se mueve al sintonizar (como SmartSDR); si no, sigue al VFO
// y solo se mueve cuando éste se acerca al borde de lo útil.

export type FreqRange = { fromHz: number; toHz: number }

export const SDR_SAMPLE_RATES = [1_024_000, 1_536_000, 2_048_000, 2_400_000] as const
export const DEFAULT_SDR_SAMPLE_RATE = 2_048_000
export const USABLE_RATIO = 0.85
const FOLLOW_MARGIN_RATIO = 0.15

export const usableSpanHz = (sampleRate: number) => sampleRate * USABLE_RATIO

type Input = { vfoHz: number; band: FreqRange | null; currentHz: number | null; sampleRate: number }

export const sdrCenterFor = ({ vfoHz, band, currentHz, sampleRate }: Input): number => {
  const usable = usableSpanHz(sampleRate)
  if (band && band.toHz - band.fromHz <= usable) return Math.round((band.fromHz + band.toHz) / 2)
  const half = usable / 2
  const margin = usable * FOLLOW_MARGIN_RATIO
  if (currentHz !== null && vfoHz >= currentHz - half + margin && vfoHz <= currentHz + half - margin) return currentHz
  if (!band) return Math.round(vfoHz)
  return Math.round(Math.min(band.toHz - half + margin, Math.max(band.fromHz + half - margin, vfoHz)))
}

// El R820T/R828D no baja de ~24 MHz: por debajo hace falta muestreo directo (V3) o
// un convertidor (V4 lo lleva dentro, upconverters externos con su desplazamiento).
export const DIRECT_SAMPLING_BELOW_HZ = 24_000_000
