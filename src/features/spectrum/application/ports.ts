// Fuentes de espectro intercambiables para el panadaptador.
//
// - audio: el audio demodulado de la radio por la tarjeta de sonido. El bin i
//   es la frecuencia de audio i * binHz; se coloca respecto al dial según el modo.
// - rf: un receptor SDR aparte (otro puerto) que entrega el espectro de RF ya en
//   frecuencias absolutas: el bin i es startHz + i * binHz.
//
// Los niveles van en dB (dBFS para audio; la referencia del SDR para rf).
export type SpectrumFrame =
  | { kind: 'audio'; binHz: number; bins: Float32Array }
  | { kind: 'rf'; startHz: number; binHz: number; bins: Float32Array }

export interface SpectrumFeed {
  read(): SpectrumFrame | null
  stop(): void
}

export type SpectrumFeedFactory = () => Promise<SpectrumFeed>
