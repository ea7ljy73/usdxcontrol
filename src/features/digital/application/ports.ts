import type { SpectrumFrame } from '@/features/spectrum/application/ports'
import type { RawDecode } from '../domain/decodeList'
import type { LogEntry } from '../domain/logbook'
import type { DigiMode } from '../domain/slots'

// Decodificador FT8/FT4 (WASM). Recibe el audio de un ciclo.
export type DigiDecoder = {
  decode(mode: DigiMode, samples: Float32Array, sampleRate: number): Promise<RawDecode[]>
}

// Audio de la radio con marcas de tiempo: devuelve lo capturado entre dos instantes
// (ms desde epoch, reloj local) o null si ese tramo no se llegó a capturar entero.
export type PcmTap = {
  readonly sampleRate: number
  read(fromMs: number, toMs: number): Float32Array | null
  stop(): void
}

// Entrada de audio de los modos digitales: además del PCM da el espectro para la
// cascada y el nivel para el vúmetro.
export type DigiAudioInput = PcmTap & {
  spectrum(): SpectrumFrame | null
  levelDb(): number
  setGain(gain: number): void
}

export type AudioInputOptions = { deviceId: string | null; gain: number }

export type DigiAudioInputFactory = (options: AudioInputOptions) => Promise<DigiAudioInput>

export type TxRequest = {
  mode: DigiMode
  message: string
  toneHz: number
  // Inicio del audio, en reloj local (ms desde epoch).
  startAtMs: number
  slotIndex: number
}

export type TxHandle = {
  // Se resuelve cuando el audio empieza a sonar y cuando ha salido entero.
  started: Promise<void>
  ended: Promise<void>
  cancel(): void
}

// Salida de audio hacia la radio (tarjeta de sonido). Lanza un error si el mensaje no
// se puede codificar.
export type DigiTransmitter = {
  // Se llama desde el clic del usuario: el navegador solo deja arrancar el audio con un gesto.
  prepare(): void
  transmit(request: TxRequest): Promise<TxHandle>
  // Portadora continua (Tune) en el tono indicado hasta stop().
  tune(toneHz: number): Promise<{ stop(): void }>
  levelDb(): number
  outputLatencyMs(): number
  setOutput(deviceId: string | null): void
  setGain(gain: number): void
}

export type PttControl = { on(): void; off(): void }

// Hora UTC de referencia (servidor de hora) para corregir el reloj del ordenador.
export type UtcSource = { fetchUtcMs(): Promise<number> }

export type AudioDevice = { id: string; label: string }
export type AudioDeviceList = { list(): Promise<{ inputs: AudioDevice[]; outputs: AudioDevice[] }> }

export type KeyValueStore = {
  get<T>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

export type LogbookRepository = {
  list(): LogEntry[]
  save(entries: LogEntry[]): void
}

// Exportar e importar el libro en ficheros ADIF.
export type LogFiles = {
  exportAdif(entries: LogEntry[], callsign: string): void
  importAdif(file: File, myCall: string): Promise<LogEntry[]>
}
