import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n/i18n'

type Props = { children: ReactNode; onCrash: () => void }
type State = { error: Error | null }

// Si una pantalla falla, en vez de dejar la ventana en blanco se explica qué ha pasado y
// se ofrece recargar. Antes de nada se corta cualquier transmisión (PTT abajo).
export class CrashScreen extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      this.props.onCrash()
    } catch {
      // ya no se puede hacer más
    }
    console.error('uSDX Control: error en la interfaz', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-fg">
        <h1 className="text-lg font-semibold">{t('app.crash.title')}</h1>
        <p className="max-w-md text-sm text-muted">{t('app.crash.body')}</p>
        <pre className="max-w-xl overflow-auto rounded border border-line bg-instrument p-2 text-left text-xs text-error">{error.message}</pre>
        <Button onClick={() => window.location.reload()}>{t('app.crash.reload')}</Button>

      </div>
    )
  }
}
