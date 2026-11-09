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
    return { inputs: named('audioinput', 'Entrada'), outputs: named('audiooutput', 'Salida') }
  },
}
