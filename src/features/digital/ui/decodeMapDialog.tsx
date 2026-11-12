import { useEffect, useMemo, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/field'
import { formatSlotUtc } from '../domain/slots'
import { gridDistanceKm, gridToLatLng, greatCirclePath } from '../domain/grid'
import { mapStations } from '../domain/stationMap'
import { useDigital } from './useDigital'
import { useI18n } from '@/i18n/useI18n'
import { countryName } from '@/i18n/countries'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const WINDOWS = [
  { id: 'lastMinute', ms: 60_000 },
  { id: 'last5', ms: 5 * 60_000 },
  { id: 'last15', ms: 15 * 60_000 },
  { id: 'all', ms: Number.POSITIVE_INFINITY },
] as const

// Leaflet pinta en SVG con atributos: los tokens del tema se leen ya resueltos.
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()

// Mapa de las estaciones decodificadas, con el trayecto desde nuestro locator.
export function DecodeMapDialog({ open, onOpenChange }: Props) {
  const { t, locale } = useI18n()
  const { receiverState, operatorState, clock } = useDigital()
  const [windowMs, setWindowMs] = useState(5 * 60_000)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const mapRef = useRef<{
    L: typeof Leaflet
    map: Leaflet.Map
    layer: Leaflet.LayerGroup
  } | null>(null)
  const [ready, setReady] = useState(0)
  const myGrid = operatorState.settings.myGrid
  const dxCall = operatorState.dxCall

  const stations = useMemo(
    () => mapStations(receiverState.decodes, Number.isFinite(windowMs) ? clock.now() - windowMs : Number.NEGATIVE_INFINITY),
    [receiverState.decodes, windowMs, clock],
  )

  useEffect(() => {
    if (!host) return
    let disposed = false
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([module]) => {
      if (disposed) return
      const L = module.default
      const map = L.map(host, {
        worldCopyJump: true,
        attributionControl: true,
      }).setView([30, 0], 2)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 12,
        attribution: '© OpenStreetMap',
      }).addTo(map)
      mapRef.current = { L, map, layer: L.layerGroup().addTo(map) }
      setReady((value) => value + 1)
    })
    return () => {
      disposed = true
      mapRef.current?.map.remove()
      mapRef.current = null
    }
  }, [host])

  useEffect(() => {
    const current = mapRef.current
    if (!current) return
    const { L, map, layer } = current
    layer.clearLayers()
    const home = gridToLatLng(myGrid)
    const colors = {
      cq: token('meter'),
      qso: token('rx'),
      dx: token('slice'),
      home: token('tx'),
      path: token('muted'),
    }
    if (home) {
      L.circleMarker(home, {
        radius: 7,
        color: colors.home,
        fillColor: colors.home,
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(`Mi QTH · ${myGrid}`)
        .addTo(layer)
    }
    for (const station of stations) {
      const isDx = station.call === dxCall
      const color = isDx ? colors.dx : station.cq ? colors.cq : colors.qso
      if (home) {
        L.polyline(greatCirclePath(home, station.position), {
          color: isDx ? colors.dx : colors.path,
          weight: isDx ? 2 : 1,
          opacity: isDx ? 0.9 : 0.35,
        }).addTo(layer)
      }
      const distance = station.grid && myGrid ? gridDistanceKm(myGrid, station.grid) : null
      L.circleMarker(station.position, {
        radius: isDx ? 7 : 5,
        color,
        fillColor: color,
        fillOpacity: station.precise ? 0.9 : 0.35,
        weight: 1,
      })
        .bindTooltip(
          [
            `${station.call}${station.grid ? ` · ${station.grid}` : ''}`,
            station.country ? countryName(station.country) : '',
            `${station.snrDb} dB · ${station.audioHz} Hz · ${formatSlotUtc(station.lastHeardMs)}`,
            distance !== null ? `${distance} km` : '',
          ]
            .filter(Boolean)
            .join('<br>'),
        )
        .addTo(layer)
    }
    map.invalidateSize()
  }, [stations, myGrid, dxCall, ready, locale])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('digital.map.title')} className="max-w-4xl">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <Select
            aria-label={t('digital.map.period')}
            className="w-40"
            value={String(windowMs)}
            onChange={(event) => setWindowMs(Number(event.target.value))}
          >
            {WINDOWS.map((option) => (
              <option key={option.id} value={String(option.ms)}>
                {t(`digital.map.window.${option.id}`)}
              </option>
            ))}
          </Select>
          <span data-testid="digi-map-count">{t('digital.map.count', { count: stations.length })}</span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-meter" /> CQ
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-rx" /> {t('digital.map.inQso')}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-slice" /> DX
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-tx" /> {t('digital.map.myQth')}
          </span>
          {!gridToLatLng(myGrid) && <span className="text-slice">{t('digital.map.setGrid')}</span>}

        </div>
        <div ref={setHost} data-testid="digi-map" className="h-96 w-full lg:h-140 bg-instrument" />
      </div>
    </Dialog>
  )
}
