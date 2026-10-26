import { _electron as electron, expect, test } from '@playwright/test'

test('la ventana de escritorio arranca', async () => {
  const app = await electron.launch({ args: ['.'] })
  const window = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 832)
  })
  // El gestor de ventanas recorta la ventana a la pantalla (p. ej. 1366×768): la captura
  // se hace siempre sobre 1280×832, sea cual sea el monitor.
  await window.setViewportSize({ width: 1280, height: 832 })

  await expect(window.getByRole('heading', { name: 'uSDX Control' })).toBeVisible()
  await expect(window.getByTestId('connection-status')).toHaveText('Desconectado')
  await expect(window.getByText('Electron · serialport')).toBeVisible()
  // La lista de puertos depende del equipo: se enmascara junto con lo que se recoloca a su lado.
  await expect(window).toHaveScreenshot('escritorio.png', {
    fullPage: true,
    mask: [window.getByTestId('utc-clock'), window.getByTestId('port-select'), window.getByTestId('header-frequency')],
  })

  await app.close()
})

// El worker y los WASM de FT8 se cargan desde file:// en la app empaquetada.
test('FT8 decodifica en la app de escritorio', async () => {
  test.setTimeout(60_000)
  const app = await electron.launch({ args: ['.'] })
  const window = await app.firstWindow()
  const errors: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  await window.evaluate(() => {
    window.location.search = '?radio=mock'
  })
  await expect(window.getByText('CAT simulado')).toBeVisible()
  await window.getByRole('button', { name: 'Conectar radio' }).click()
  await expect(window.getByTestId('connection-status')).toHaveText('Conectado', { timeout: 5_000 })
  await window.getByTestId('digi-ft8').click()
  await expect(window.getByTestId('digi-workspace')).toBeVisible()
  await expect(window.getByTestId('digi-decodes')).toContainText('W1FC F5BZB -08', { timeout: 25_000 })
  expect(errors).toEqual([])
  await app.close()
})
