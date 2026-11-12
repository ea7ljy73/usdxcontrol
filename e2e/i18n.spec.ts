import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('se cambia el idioma de la interfaz y se recuerda al recargar', async ({ page }) => {
  await page.goto('/?radio=mock')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.getByTestId('connection-status')).toHaveText('Desconectado')

  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByTestId('connection-status')).toHaveText('Disconnected')
  await expect(page.getByText('Simulated CAT')).toBeAttached()
  await page.getByRole('button', { name: 'Connect radio' }).click()
  await expect(page.getByTestId('connection-status')).toHaveText('Connected', { timeout: 5_000 })
  await expect(page.getByRole('group', { name: 'Bands' })).toBeVisible()

  // Pantalla FT8 y uno de sus diálogos, también en inglés.
  await page.getByTestId('digi-ft8').click()
  await expect(page.getByRole('heading', { name: 'Waterfall' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings…' }).first().click()
  const settings = page.getByRole('dialog', { name: 'FT8 settings' })
  await expect(settings.getByText('My callsign')).toBeVisible()
  await settings.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(page.getByTestId('connection-status')).toHaveText('Disconnected')
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en')

  const a11y = await new AxeBuilder({ page }).analyze()
  expect(a11y.violations).toEqual([])

  await page.getByRole('combobox', { name: 'Language' }).selectOption('es')
  await expect(page.getByTestId('connection-status')).toHaveText('Desconectado')
})

test.describe('sistema en inglés', () => {
  test.use({ locale: 'en-US' })

  test('sin idioma elegido, la app sigue el idioma del sistema', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('button', { name: 'Connect radio' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
  })
})
