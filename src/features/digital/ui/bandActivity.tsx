import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { DecodeTable } from './decodeTable'
import { useDigital, useStoredState } from './useDigital'

// Lee un WAV (PCM 8/16 bits o float 32, mono o estéreo) a muestras mono.
const readWav = async (file: File): Promise<{ samples: Float32Array; rate: number }> => {
  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)
  if (buffer.byteLength < 44 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw new Error('No es un fichero WAV')
  }
  let format = -1
  let offset = 12
  while (offset + 8 <= buffer.byteLength) {
    const id = view.getUint32(offset, false)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 0x666d7420) format = body
    if (id === 0x64617461 && format >= 0) {
      const kind = view.getUint16(format, true)
      const channels = view.getUint16(format + 2, true)
      const rate = view.getUint32(format + 4, true)
      const bits = view.getUint16(format + 14, true)
      const bytes = bits / 8
      const frames = Math.floor(Math.min(size, buffer.byteLength - body) / (bytes * channels))
      const samples = new Float32Array(frames)
      for (let i = 0; i < frames; i++) {
        let sum = 0
        for (let c = 0; c < channels; c++) {
          const at = body + (i * channels + c) * bytes
          sum +=
            kind === 3
              ? view.getFloat32(at, true)
              : bits === 16
                ? view.getInt16(at, true) / 32_768
                : (view.getUint8(at) - 128) / 128
        }
        samples[i] = sum / channels
      }
      return { samples, rate }
    }
    offset = body + size + (size % 2)
  }
  throw new Error('WAV sin audio')
}

// "Band Activity" de WSJT-X: clic elige la estación DX, doble clic (o Intro) contesta.
export function BandActivity() {
  const { receiver, receiverState, operator } = useDigital()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [filter, setFilter] = useStoredState('digi.activity', { cqOnly: false })
  const { status, decoding, decodes } = receiverState
  const shown = filter.cqOnly ? decodes.filter((decode) => decode.tx || decode.parsed?.kind === 'cq') : decodes
  const statusLabel =
    status === 'error'
      ? (receiverState.lastError ?? 'Error de audio')
      : status === 'starting'
        ? 'Abriendo el audio…'
        : decoding
          ? 'Decodificando…'
          : status === 'on'
            ? '● En vivo'
            : status === 'paused'
              ? 'En pausa'
              : 'Parado'

  const openFile = async (file: File) => {
    try {
      const { samples, rate } = await readWav(file)
      const found = await receiver.decodeFile(samples, rate)
      operator.notify(
        found > 0 ? `${file.name}: ${found} señales decodificadas` : `${file.name}: sin señales FT8/FT4`,
        found > 0 ? 'success' : 'error',
      )
    } catch (error) {
      operator.notify(`${file.name}: ${error instanceof Error ? error.message : 'no se pudo leer'}`, 'error')
    }
  }

  return (
    <section
      aria-labelledby="digi-activity"
      data-testid="digi-panel"
      data-decoded-slot={receiverState.lastDecodedSlotMs ?? ''}
      className="flex min-h-48 min-w-0 flex-col bg-panel-deep"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-navy px-2 py-1">
        <h2 id="digi-activity" className="text-sm font-medium">
          Band Activity · {receiverState.mode}
        </h2>
        <span
          data-testid="digi-status"
          role="status"
          className={cn(
            'text-xs',
            status === 'error' ? 'text-error' : decoding ? 'text-slice' : status === 'on' ? 'text-rx' : 'text-muted',
          )}
        >
          {statusLabel}
        </span>
        <span className="ml-auto flex gap-px">
          <Button
            variant={filter.cqOnly ? 'navy' : 'tile'}
            aria-pressed={filter.cqOnly}
            className="h-7 px-2 text-xs"
            onClick={() => setFilter({ cqOnly: !filter.cqOnly })}
          >
            Solo CQ
          </Button>
          <Button
            variant="tile"
            className="h-7 px-2 text-xs"
            disabled={status !== 'on' && status !== 'paused'}
            onClick={() => void receiver.decodeNow()}
          >
            Decodificar
          </Button>
          <Button variant="tile" className="h-7 px-2 text-xs" onClick={() => fileRef.current?.click()}>
            Abrir WAV…
          </Button>
          <Button variant="tile" className="h-7 px-2 text-xs" disabled={decodes.length === 0} onClick={receiver.clear}>
            Limpiar
          </Button>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          aria-label="Fichero WAV para decodificar"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void openFile(file)
            event.target.value = ''
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-instrument">
        {decodes.length === 0 ? (
          <p className="p-3 text-xs text-muted">
            {status === 'on'
              ? `Esperando el primer ciclo: se decodifica a los ${receiverState.mode === 'FT8' ? '14' : '6,4'} s de cada uno.`
              : 'Pulsa Escuchar para recibir.'}
          </p>
        ) : (
          <DecodeTable decodes={shown} testId="digi-decodes" label="Band Activity" />
        )}
      </div>
    </section>
  )
}
