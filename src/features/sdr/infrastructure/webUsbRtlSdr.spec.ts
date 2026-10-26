import { describe, expect, it } from 'vitest'
import { explainUsbError } from './webUsbRtlSdr'

const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Electron/38.0'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0'

const named = (name: string, message: string) => Object.assign(new Error(message), { name })
const claimFailed = new Error('Could not connect to the RTL-SDR stick. Are you using it in another application?')

describe('explainUsbError', () => {
  it('en Linux, el dongle ocupado por el driver de TV dice cómo liberarlo', () => {
    expect(explainUsbError(claimFailed, LINUX).message).toContain('sudo modprobe -r dvb_usb_rtl28xxu')
  })

  it('en Windows, el dongle ocupado remite a Zadig', () => {
    expect(explainUsbError(claimFailed, WINDOWS).message).toContain('Zadig')
  })

  it('en macOS, el dongle ocupado pide cerrarlo en el otro programa', () => {
    expect(explainUsbError(claimFailed, MAC).message).toMatch(/otro programa/)
  })

  it('sin dongle conectado lo dice en español', () => {
    expect(explainUsbError(named('NotFoundError', 'No device selected.'), MAC).message).toBe(
      'No se encuentra ningún RTL-SDR conectado por USB.',
    )
  })

  it('sin permiso en Linux apunta a la regla udev', () => {
    const denied = named('SecurityError', "Failed to execute 'open' on 'USBDevice': Access denied.")
    expect(explainUsbError(denied, LINUX).message).toContain('udev')
  })

  it('los demás errores pasan tal cual', () => {
    const other = new Error('USB desconectado')
    expect(explainUsbError(other, LINUX)).toBe(other)
  })
})
