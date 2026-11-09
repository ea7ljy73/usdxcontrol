import { container } from './container'
import { ContainerProvider } from './containerProvider'
import { CrashScreen } from './crashScreen'
import { RadioScreen } from '@/features/radio/ui/radioScreen'

export default function App() {
  return (
    <CrashScreen onCrash={() => container.digital.operator.haltTx()}>
      <ContainerProvider>
        <RadioScreen />
      </ContainerProvider>
    </CrashScreen>
  )
}
