import { ContainerProvider } from './containerProvider'
import { RadioScreen } from '@/features/radio/ui/radioScreen'

export default function App() {
  return (
    <ContainerProvider>
      <RadioScreen />
    </ContainerProvider>
  )
}
