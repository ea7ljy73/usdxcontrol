import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { useDigital } from './useDigital'

const NOTICE_MS = 6_000

// Avisos del operador (QSO completado, errores de TX…), que se van solos.
export function DigiNotices() {
  const { operator, operatorState } = useDigital()
  const { notices } = operatorState

  useEffect(() => {
    const timers = notices.map((notice) => window.setTimeout(() => operator.dismissNotice(notice.id), NOTICE_MS))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [notices, operator])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-1"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          data-tone={notice.tone}
          className={cn(
            'pointer-events-auto flex items-start gap-2 border-l-4 bg-navy px-3 py-2 text-sm text-fg',
            notice.tone === 'error' ? 'border-tx' : notice.tone === 'success' ? 'border-meter' : 'border-slice',
          )}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            className="text-muted hover:text-fg"
            onClick={() => operator.dismissNotice(notice.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
