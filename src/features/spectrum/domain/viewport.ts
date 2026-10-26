// Ventana de RF que muestra el panadaptador. Como en SmartSDR, la vista queda
// fija y es la línea del slice la que se mueve; la vista solo se desplaza cuando
// el dial se acerca a un borde, y nunca se sale de la banda.

export type FreqRange = { fromHz: number; toHz: number }

export type SpanOption = { id: string; spanHz: number; label: string }

// Margen a cada lado de la banda en la vista completa, para ver los bordes.
const BAND_PADDING_RATIO = 0.03
// Distancia al borde (fracción del ancho) que obliga a reencuadrar.
const FOLLOW_MARGIN_RATIO = 0.08
const ZOOM_SPANS_HZ = [100_000, 25_000, 6_000] as const
const NO_BAND_SPANS_HZ = [50_000, 12_000, 4_800] as const

const spanLabel = (spanHz: number) => `${spanHz / 1_000}k`

export const spanOptions = (band: FreqRange | null): SpanOption[] => {
  if (band === null) {
    return NO_BAND_SPANS_HZ.map((spanHz) => ({ id: String(spanHz), spanHz, label: spanLabel(spanHz) }))
  }
  const width = band.toHz - band.fromHz
  return [
    { id: 'band', spanHz: Math.round(width * (1 + 2 * BAND_PADDING_RATIO)), label: 'BAND' },
    ...ZOOM_SPANS_HZ.filter((spanHz) => spanHz < width).map((spanHz) => ({
      id: String(spanHz),
      spanHz,
      label: spanLabel(spanHz),
    })),
  ]
}

type FollowInput = {
  vfoHz: number
  centerHz: number | null
  spanHz: number
  band: FreqRange | null
}

export const followViewCenter = ({ vfoHz, centerHz, spanHz, band }: FollowInput): number => {
  if (band !== null && spanHz >= band.toHz - band.fromHz) return (band.fromHz + band.toHz) / 2
  const half = spanHz / 2
  const margin = spanHz * FOLLOW_MARGIN_RATIO
  const inside = centerHz !== null && vfoHz >= centerHz - half + margin && vfoHz <= centerHz + half - margin
  const target = inside ? centerHz : vfoHz
  if (band === null) return target
  const slack = spanHz * BAND_PADDING_RATIO
  const lowest = band.fromHz - slack + half
  const highest = band.toHz + slack - half
  return Math.min(highest, Math.max(lowest, target))
}
