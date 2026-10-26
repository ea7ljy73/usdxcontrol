import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('la pantalla de control muestra el estado sin radio conectada', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'uSDX Control' })).toBeVisible()
  await expect(page.getByTestId('connection-status')).toHaveText('Desconectado')
  await expect(page.getByTestId('vfo-frequency')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'USB' })).toBeDisabled()
  await expect(page.getByTestId('ptt')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Conectar radio' })).toBeVisible()
  await expect(page.getByTestId('spectrum-canvas')).toBeVisible()
  await expect(page.getByTestId('waterfall-canvas')).toBeVisible()
  expect(errors).toEqual([])

  const a11y = await new AxeBuilder({ page }).analyze()
  expect(a11y.violations).toEqual([])

  await expect(page).toHaveScreenshot('pantalla-control.png', { fullPage: true, mask: [page.getByTestId('utc-clock')] })
})
