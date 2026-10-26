// Receptor SDR (RTL-SDR) para el panadaptador: solo escucha; la TX es siempre del uSDX.

export type SdrSource = 'usb' | 'tcp'
export type DirectSamplingMode = 'off' | 'i' | 'q'

export type SdrSettings = {
  source: SdrSource
  // rtl_tcp
  host: string
  port: number
  sampleRate: number
  // dB del sintonizador; null = automática.
  gainDb: number | null
  // V3 y clones (HTOOL…): HF por muestreo directo en la rama Q.
  directSampling: DirectSamplingMode
  ppm: number
  // Upconverter externo (p. ej. 125 MHz): se sintoniza RF + desplazamiento.
  upconverterHz: number
  // Deja de recibir mientras transmite el uSDX.
  muteOnTx: boolean
}

export type SdrDevice = {
  setSampleRate(rate: number): Promise<number>
  setCenterHz(hz: number): Promise<void>
  setGain(gainDb: number | null): Promise<void>
  setDirectSampling(mode: DirectSamplingMode): Promise<void>
  setPpm(ppm: number): Promise<void>
  // Muestras IQ de 8 bits sin signo intercaladas (I, Q, I, Q…).
  read(samples: number): Promise<Uint8Array>
  close(): Promise<void>
}

export type SdrConnector = (settings: SdrSettings) => Promise<SdrDevice>
export type SdrConnectors = Partial<Record<SdrSource, SdrConnector>>
