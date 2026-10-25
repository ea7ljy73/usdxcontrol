import { useSyncExternalStore } from 'react'
import { useContainer, type PortSelection } from '@/app/container'
import type { RadioSnapshot } from '../application/radioSession'

type RadioSession = ReturnType<typeof import('../application/radioSession').createRadioSession>

export const useRadioSession = (): {
  session: RadioSession
  snapshot: RadioSnapshot
  linkKind: string
  portSelection: PortSelection | null
  spectrumSimulated: boolean
} => {
  const { session, linkKind, portSelection, spectrumSimulated } = useContainer()
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  )
  return { session, snapshot, linkKind, portSelection, spectrumSimulated }
}
