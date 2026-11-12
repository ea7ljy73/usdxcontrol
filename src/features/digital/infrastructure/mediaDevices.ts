import { t } from '@/i18n/i18n'
import type { AudioDeviceList } from '../application/ports'

// Entradas virtuales de Chrome que duplican una tarjeta real.
const ALIASES = new Set(['default', 'communications', ''])

// Tarjetas de sonido del sistema. Los nombres solo aparecen tras dar permiso de audio:
// si aún no lo hay, se pide una vez (y se suelta el micrófono enseguida).
export const mediaDeviceList: AudioDeviceList = {
  async list() {
    const media = navigator.mediaDevices
    if (!media?.enumerateDevices) return { inputs: [], outputs: [] }
    let devices = await media.enumerateDevices()
    if (devices.some((device) => device.kind === 'audioinput' && device.label === '') && media.getUserMedia) {
      try {
        const stream = await media.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        devices = await media.enumerateDevices()
      } catch {
        // Sin permiso: se listan sin nombre.
      }
    }
    const named = (kind: MediaDeviceKind, fallback: string) =>
      devices
        .filter((device) => device.kind === kind && !ALIASES.has(device.deviceId))
        .map((device, index) => ({ id: device.deviceId, label: device.label || `${fallback} ${index + 1}` }))
    // Chrome nombra la entrada virtual «default» como «Predeterminado - <tarjeta real>».
    const fallback = devices.find((device) => device.kind === 'audiooutput' && device.deviceId === 'default')?.label
    const defaultOutput = fallback?.replace(/^[^-]*-\s*/, '') || undefined
    return { inputs: named('audioinput', t('audio.fallbackInput'))
, outputs: named('audiooutput', t('audio.fallbackOutput')), defaultOutput }
  },
}
