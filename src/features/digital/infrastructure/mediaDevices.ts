import type { AudioDeviceList } from '../application/ports'

// Tarjetas de sonido del sistema (los nombres solo aparecen tras dar permiso de audio).
export const mediaDeviceList: AudioDeviceList = {
  async list() {
    if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] }
    const devices = await navigator.mediaDevices.enumerateDevices()
    const named = (kind: MediaDeviceKind, fallback: string) =>
      devices
        .filter((device) => device.kind === kind && device.deviceId !== 'default' && device.deviceId !== '')
        .map((device, index) => ({ id: device.deviceId, label: device.label || `${fallback} ${index + 1}` }))
    return { inputs: named('audioinput', 'Entrada'), outputs: named('audiooutput', 'Salida') }
  },
}
