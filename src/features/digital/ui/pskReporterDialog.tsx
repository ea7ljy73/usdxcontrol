import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { gridDistanceKm, gridToLatLng, greatCirclePath } from '../domain/grid'
import { bandOf, summarizePsk, type PskSpot } from '../domain/pskReport'
import { useDigital } from './useDigital'
import { useI18n } from '@/i18n/useI18n'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

// PSK Reporter limita las consultas: con el diálogo abierto se refresca cada 5 min.
const REFRESH_MS = 5 * 60_000

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()

const hhmm = (ms: number) => {
  const date = new Date(ms)
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

// Quién oye nuestra señal (PSK Reporter, última hora): mapa de receptores y lista.
export function PskReporterDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n()
  const { pskReporter, operatorState } = useDigital()
  const myCall = operatorState.settings.myCall
  const myGrid = operatorState.settings.myGrid
  const [spots, setSpots] = useState<PskSpot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const mapRef = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null)
  const [ready, setReady] = useState(0)

  const refresh = useCallback(async () => {
    if (!myCall) return
    setLoading(true)
    setError(null)
    try {
      setSpots(await pskReporter.spotsFor(myCall))
      setUpdatedAt(Date.now())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [pskReporter, myCall])

  useEffect(() => {
    if (!open) return
    const first = window.setTimeout(() => void refresh(), 0)
    const id = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [open, refresh])

  useEffect(() => {
    if (!host) return
    let disposed = false
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([module]) => {
      if (disposed) return
      const L = module.default
      const map = L.map(host, { worldCopyJump: true, attributionControl: true }).setView([40, 0], 3)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '© OpenStreetMap' }).addTo(map)
      mapRef.current = { L, map, layer: L.layerGroup().addTo(map) }
      setReady((value) => value + 1)
    })
    return () => {
      disposed = true
      mapRef.current?.map.remove()
      mapRef.current = null
    }
  }, [host])

  // Una entrada por receptor: la escucha más reciente.
  const receivers = useMemo(() => {
    const latest = new Map<string, PskSpot>()
    for (const spot of spots) if (!latest.has(spot.receiver)) latest.set(spot.receiver, spot)
    return [...latest.values()]
  }, [spots])
  const summary = useMemo(() => summarizePsk(spots, myGrid), [spots, myGrid])

  useEffect(() => {
    const current = mapRef.current
    if (!current) return
    const { L, map, layer } = current
    layer.clearLayers()
    const home = gridToLatLng(myGrid)
    const strong = token('rx')
    const weak = token('meter')
    const path = token('muted')
    const homeColor = token('tx')
    const points: Leaflet.LatLngExpression[] = []
    if (home) {
      points.push(home)
      L.circleMarker(home, { radius: 7, color: homeColor, fillColor: homeColor, fillOpacity: 1, weight: 2 })
        .bindTooltip(`${myCall} · ${myGrid}`)
        .addTo(layer)
    }
    for (const spot of receivers) {
      const position = gridToLatLng(spot.locator)
      if (!position) continue
      points.push(position)
      const color = spot.snrDb !== null && spot.snrDb >= -10 ? strong : weak
      if (home) L.polyline(greatCirclePath(home, position), { color: path, weight: 1, opacity: 0.4 }).addTo(layer)
      const km = myGrid ? gridDistanceKm(myGrid, spot.locator) : null
      L.circleMarker(position, { radius: 6, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
        .bindTooltip(
          [
            `${spot.receiver} · ${spot.locator}`,
            spot.country,
            `${spot.snrDb ?? '?'} dB · ${bandOf(spot.frequencyHz)} · ${hhmm(spot.timeMs)} UTC`,
            km !== null ? `${km} km` : '',
          ]
            .filter(Boolean)
            .join('<br>'),
        )
        .addTo(layer)
    }
    map.invalidateSize()
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 6 })
  }, [receivers, myGrid, myCall, ready])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="PSK Reporter"
      description={t('digital.psk.description')}
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <Button variant="tile" className="h-7 px-2 text-xs" disabled={!myCall || loading} onClick={() => void refresh()}>
            {loading ? t('digital.psk.loading') : t('digital.psk.refresh')}
          </Button>
          {myCall ? (
            <span data-testid="psk-summary">
              {myCall}: {t('digital.psk.heardBy')} <strong className="text-fg">{summary.count}</strong> {t('digital.psk.stations')}
              {summary.bestSnr !== null && <> · {t('digital.psk.best', { snr: summary.bestSnr })}</>}
              {summary.farthestKm !== null && (
                <>
                  {' '}
                  · {t('digital.psk.farthest', { call: summary.farthestCall ?? '', km: summary.farthestKm })}
                </>
              )}
            </span>
          ) : (
            <span className="text-slice">{t('digital.psk.needCall')}</span>
          )}
          {updatedAt !== null && <span>{t('digital.psk.updated', { time: hhmm(updatedAt) })}</span>}
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-rx" /> ≥ −10 dB
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-meter" /> &lt; −10 dB
          </span>
        </div>
        {error && (
          <p className="text-xs text-error" role="alert">
            {error}
          </p>
        )}
        <div ref={setHost} data-testid="psk-map" className="h-72 w-full bg-instrument lg:h-96" />
        <div className="max-h-56 overflow-auto">
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-panel text-left text-muted">
              <tr>
                <th className="px-1">UTC</th>
                <th className="px-1">{t('digital.psk.receiver')}</th>
                <th className="px-1">{t('digital.log.grid')}</th>
                <th className="px-1">{t('digital.table.country')}</th>
                <th className="px-1 text-right">dB</th>
                <th className="px-1">{t('digital.psk.band')}</th>
                <th className="px-1 text-right">km</th>
              </tr>
            </thead>
            <tbody>
              {spots.map((spot) => (
                <tr key={`${spot.receiver}-${spot.timeMs}-${spot.frequencyHz}`} className="border-t border-line">
                  <td className="px-1">{hhmm(spot.timeMs)}</td>
                  <td className="px-1">{spot.receiver}</td>
                  <td className="px-1">{spot.locator}</td>
                  <td className="px-1">{spot.country}</td>
                  <td className="px-1 text-right">{spot.snrDb ?? ''}</td>
                  <td className="px-1">{bandOf(spot.frequencyHz)}</td>
                  <td className="px-1 text-right">{myGrid && spot.locator ? (gridDistanceKm(myGrid, spot.locator) ?? '') : ''}</td>
                </tr>
              ))}
              {spots.length === 0 && !loading && myCall && (
                <tr>
                  <td colSpan={7} className="px-1 py-2 text-muted">
                    {t('digital.psk.none')}

                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  )
}
