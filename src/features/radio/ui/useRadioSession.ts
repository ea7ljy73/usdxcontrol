import { useSyncExternalStore } from 'react'
import { useContainer, type LinkKind, type PortSelection, type SpectrumFeeds } from '@/app/container'
import type { RadioSnapshot } from '../application/radioSession'

type RadioSession = ReturnType<typeof import('../application/radioSession').createRadioSession>

export const useRadioSession = (): {
  session: RadioSession
  snapshot: RadioSnapshot
  linkKind: LinkKind

  portSelection: PortSelection | null
  spectrumSimulated: boolean
  spectrumFeeds: SpectrumFeeds
} => {
  const { session, linkKind, portSelection, spectrumSimulated, spectrumFeeds } = useContainer()
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  )
  return { session, snapshot, linkKind, portSelection, spectrumSimulated, spectrumFeeds }
}
