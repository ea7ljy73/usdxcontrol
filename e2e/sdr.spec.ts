import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Colores distintos pintados en el espectro: sin fuente solo está la rejilla.
const spectrumColors = (page: Page) =>
  page.getByTestId('spectrum-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return 0
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const colors = new Set<number>()
    for (let i = 0; i < data.length; i += 4) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
    return colors.size
  })

// En simulación el SDR genera IQ con señales de 40 m: el panadaptador pasa a pintar la RF.
test('el SDR da el espectro de RF y deja de recibir mientras transmite el uSDX', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/?radio=mock')
  await page.getByRole('button', { name: 'Conectar radio' }).click()
  await expect(page.getByTestId('connection-status')).toHaveText('Conectado', { timeout: 5_000 })
  const before = await spectrumColors(page)

  const button = page.getByTestId('sdr-button')
  await expect(button).toHaveAccessibleName('SDR: desconectado')
  await button.click()
  const dialog = page.getByRole('dialog', { name: 'Receptor SDR' })
  await expect(dialog.getByRole('combobox', { name: 'Conexión' })).toHaveValue('usb')
  await expect(dialog.getByRole('combobox', { name: 'Muestreo directo (HF)' })).toHaveValue('q')
  const a11y = await new AxeBuilder({ page }).analyze()
  expect(a11y.violations).toEqual([])

  await dialog.getByRole('button', { name: 'Conectar SDR' }).click()
  // 40 m (7.000–7.300) cabe entera en 2,048 MS/s: el SDR se centra en la banda.
  await expect(dialog.getByTestId('sdr-status')).toHaveText('Recibiendo · 7.150 MHz')
  await page.keyboard.press('Escape')
  await expect(button).toHaveAccessibleName('SDR: recibiendo')
  await expect(page.getByTestId('spectrum-source')).toHaveText('SDR simulado')
  await expect.poll(() => spectrumColors(page)).toBeGreaterThan(before + 10)

  // PTT del uSDX: el SDR se pausa y vuelve al soltar.
  await page.getByRole('heading', { name: 'uSDX Control' }).click()
  await page.keyboard.down(' ')
  await expect(page.getByTestId('ptt')).toHaveText('TX')
  await expect(page.getByTestId('spectrum-source')).toHaveText('SDR en pausa · TX')
  await expect(button).toHaveAccessibleName('SDR: en pausa por TX')
  await page.keyboard.up(' ')
  await expect(page.getByTestId('spectrum-source')).toHaveText('SDR simulado')

  // Cambiar de banda recentra el SDR.
  await page.getByTestId('band-20m').click()
  await button.click()
  await expect(dialog.getByTestId('sdr-status')).toHaveText('Recibiendo · 14.175 MHz')
  await dialog.getByRole('button', { name: 'Desconectar SDR' }).click()
  await expect(dialog.getByTestId('sdr-status')).toHaveText('Desconectado')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('spectrum-source')).toHaveCount(0)

  expect(errors).toEqual([])
})
