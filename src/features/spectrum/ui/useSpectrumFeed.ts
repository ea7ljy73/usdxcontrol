import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpectrumFeed, SpectrumFeedFactory } from '../application/ports'

export type FeedState = 'off' | 'on' | 'error'

// Una fuente de espectro compartida por todas las vistas que la pintan.
export const useSpectrumFeed = (factory: SpectrumFeedFactory | null) => {
  const [feed, setFeed] = useState<SpectrumFeed | null>(null)
  const [state, setState] = useState<FeedState>('off')
  const feedRef = useRef<SpectrumFeed | null>(null)

  const stop = useCallback(() => {
    feedRef.current?.stop()
    feedRef.current = null
    setFeed(null)
    setState('off')
  }, [])

  const start = useCallback(async () => {
    if (factory === null || feedRef.current !== null) return
    try {
      const started = await factory()
      feedRef.current = started
      setFeed(started)
      setState('on')
    } catch {
      setState('error')
    }
  }, [factory])

  useEffect(() => () => feedRef.current?.stop(), [])

  return { feed, state, start, stop }
}
