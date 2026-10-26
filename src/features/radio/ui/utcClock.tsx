import { useEffect, useState } from 'react'

const formatUtc = (date: Date) =>
  `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`

export function UtcClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <span data-testid="utc-clock" className="flex items-baseline gap-1 text-muted">
      <span className="text-lg font-light italic tabular-nums">{formatUtc(now)}</span>
      <span className="text-xs">UTC</span>
    </span>
  )
}
