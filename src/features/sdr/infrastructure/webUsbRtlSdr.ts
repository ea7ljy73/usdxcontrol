import type { DirectSamplingMode, SdrConnector } from '../application/ports'

type UsbPlatform = 'linux' | 'windows' | 'other'

const platformOf = (userAgent: string): UsbPlatform =>
  /Android/.test(userAgent) ? 'other' : /Linux/.test(userAgent) ? 'linux' : /Windows/.test(userAgent) ? 'windows' : 'other'

// WebUSB y webrtlsdr fallan con mensajes técnicos en inglés: se traducen a qué pasa y cómo
// arreglarlo en cada sistema. El caso típico en Linux es el driver de TV del kernel, que se
// queda la interfaz 0 del dongle y WebUSB no puede quitársela.
export const explainUsbError = (error: unknown, userAgent: string): Error => {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  const platform = platformOf(userAgent)
  if (name === 'NotFoundError') {
    return new Error(
      platform === 'windows'
        ? 'No se encuentra ningún RTL-SDR. Conéctalo y comprueba que tiene el driver WinUSB (Zadig).'
        : 'No se encuentra ningún RTL-SDR conectado por USB.',
    )
  }
  if (name === 'SecurityError' || /access denied/i.test(message)) {
    return new Error(
      platform === 'linux'
        ? 'Sin permiso para abrir el RTL-SDR: falta la regla udev del USB 0bda:2832/2838 (ver el manual, apartado SDR).'
        : 'El sistema no deja abrir el RTL-SDR. Ciérralo en cualquier otro programa que lo use.',
    )
  }
  if (/another application|claim/i.test(message)) {
    if (platform === 'linux') {
      return new Error(
        'Linux tiene ocupado el RTL-SDR con su driver de TV. Ejecuta «sudo modprobe -r dvb_usb_rtl28xxu» y vuelve a conectar; para que no se repita, mira el manual (apartado SDR).',
      )
    }
    if (platform === 'windows') {
      return new Error('Windows no deja abrir el RTL-SDR: instala el driver WinUSB con Zadig o ciérralo en otro programa.')
    }
    return new Error('No se puede abrir el RTL-SDR: ciérralo en cualquier otro programa que lo esté usando.')
  }
  return error instanceof Error ? error : new Error(message)
}

// RTL-SDR (RTL2832U + R820T/R820T2/R828D: V3, V4 y clones como HTOOL) por WebUSB, con el
// driver de webrtlsdr. Funciona en Chrome/Edge y en la app de escritorio; en Linux el
// módulo dvb_usb_rtl28xxu del kernel tiene que estar desactivado para poder abrirlo.
export const webUsbRtlSdr: SdrConnector = async () => {
  const { RTL2832U_Provider, DirectSampling } = await import('@jtarrio/webrtlsdr/rtlsdr.js')
  const modes: Record<DirectSamplingMode, number> = { off: DirectSampling.Off, i: DirectSampling.I, q: DirectSampling.Q }
  const device = await new RTL2832U_Provider().get().catch((error: unknown) => {
    throw explainUsbError(error, navigator.userAgent)
  })
  await device.resetBuffer()
  return {
    setSampleRate: (rate) => device.setSampleRate(rate),
    setCenterHz: async (hz) => {
      await device.setCenterFrequency(hz)
    },
    setGain: (gain) => device.setGain(gain),
    setDirectSampling: (mode) => device.setDirectSamplingMethod(modes[mode]),
    setPpm: (ppm) => device.setFrequencyCorrection(ppm),
    read: async (samples) => new Uint8Array((await device.readSamples(samples)).data),
    close: () => device.close(),
  }
}
