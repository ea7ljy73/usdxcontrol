import { _electron as electron, expect, test } from '@playwright/test'

test('la ventana de escritorio arranca', async () => {
  const app = await electron.launch({ args: ['.'] })
  const window = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 832)
  })

  await expect(window.getByRole('heading', { name: 'uSDX Control' })).toBeVisible()
  await expect(window.getByTestId('connection-status')).toHaveText('Desconectado')
  await expect(window.getByText('Electron · serialport')).toBeVisible()
  await expect(window).toHaveScreenshot('escritorio.png', { fullPage: true })

  await app.close()
})
