import type { DirectSamplingMode, SdrConnector } from '../application/ports'

// RTL-SDR (RTL2832U + R820T/R820T2/R828D: V3, V4 y clones como HTOOL) por WebUSB, con el
// driver de webrtlsdr. Funciona en Chrome/Edge y en la app de escritorio; en Linux el
// módulo dvb_usb_rtl28xxu del kernel tiene que estar desactivado para poder abrirlo.
export const webUsbRtlSdr: SdrConnector = async () => {
  const { RTL2832U_Provider, DirectSampling } = await import('@jtarrio/webrtlsdr/rtlsdr.js')
  const modes: Record<DirectSamplingMode, number> = { off: DirectSampling.Off, i: DirectSampling.I, q: DirectSampling.Q }
  const device = await new RTL2832U_Provider().get()
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
