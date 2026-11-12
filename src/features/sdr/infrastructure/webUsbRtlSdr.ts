import { t } from '@/i18n/i18n'
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
        ? t('errors.sdr.notFoundWindows')
        : t('errors.sdr.notFound'),
    )
  }
  if (name === 'SecurityError' || /access denied/i.test(message)) {
    return new Error(
      platform === 'linux'
        ? t('errors.sdr.noPermissionLinux')
        : t('errors.sdr.noPermission'),
    )
  }
  if (/another application|claim/i.test(message)) {
    if (platform === 'linux') {
      return new Error(
        t('errors.sdr.busyLinux'),
      )
    }
    if (platform === 'windows') {
      return new Error(t('errors.sdr.busyWindows'))
    }
    return new Error(t('errors.sdr.busy'))

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
