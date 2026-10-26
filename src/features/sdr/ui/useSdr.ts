import { useSyncExternalStore } from 'react'
import { useContainer } from '@/app/container'

export const useSdr = () => {
  const { sdr } = useContainer()
  const sdrState = useSyncExternalStore(sdr.subscribe, sdr.getState, sdr.getState)
  return { sdr, sdrState }
}
