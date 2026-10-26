import { useEffect, useState, useSyncExternalStore } from 'react'
import { useContainer } from '@/app/container'

// Receptor y operador FT8 con su estado, para la pantalla digital.
export const useDigital = () => {
  const { digital } = useContainer()
  const receiverState = useSyncExternalStore(digital.receiver.subscribe, digital.receiver.getState, digital.receiver.getState)
  const operatorState = useSyncExternalStore(digital.operator.subscribe, digital.operator.getState, digital.operator.getState)
  return { ...digital, receiverState, operatorState }
}

// Hora UTC corregida, refrescada varias veces por segundo para el reloj y el ciclo.
export const useUtcNow = (intervalMs = 250) => {
  const { digital } = useContainer()
  const [now, setNow] = useState(() => digital.clock.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(digital.clock.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [digital.clock, intervalMs])
  return now
}

// Ajuste de la pantalla que se recuerda entre sesiones.
export const useStoredState = <T>(key: string, initial: T) => {
  const { digital } = useContainer()
  const [value, setValue] = useState<T>(() => ({
    ...initial,
    ...(digital.store.get<T>(key) ?? {}),
  }))
  useEffect(() => {
    digital.store.set(key, value)
  }, [digital.store, key, value])
  return [value, setValue] as const
}
