import type { ReactNode } from 'react'
import { ContainerContext, container } from './container'

export function ContainerProvider({ children }: { children: ReactNode }) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>
}
