import { expect, test, type Page } from '@playwright/test'

// Genera las capturas de la documentación con la radio y el SDR simulados, en cada idioma.
// Uso: pnpm capturas  →  docs/capturas/es/*.png y docs/capturas/en/*.png
const LOCALES = ['es', 'en'] as const
const OUT = 'docs/capturas'

const start = async (page: Page, locale: (typeof LOCALES)[number]) => {
  await page.addInitScript((lang) => {
    localStorage.setItem('ui.locale', lang)
    localStorage.setItem('usdx.digi.settings', JSON.stringify({ myCall: 'EA7LJY', myGrid: 'IM76' }))
  }, locale)
  await page.goto('/?radio=mock')
  await page.getByTestId('connection-status').waitFor()
  await page.getByRole('button', { name: /^(Conectar radio|Connect radio)$/ }).click()
  await expect(page.getByTestId('ptt')).toBeEnabled({ timeout: 5_000 })
}

for (const locale of LOCALES) {
  test(`capturas · ${locale}`, async ({ page }) => {
    await start(page, locale)

    // Estación FT8 con los decodificados de un ciclo y una estación DX elegida.
    await page.getByTestId('digi-ft8').click()
    const decodes = page.getByTestId('digi-decodes')
    await expect(decodes).toContainText('W1FC F5BZB -08', { timeout: 30_000 })
    await decodes.getByRole('button', { name: /W1FC F5BZB -08/ }).click()
    await page.mouse.move(0, 0)
    await page.screenshot({ path: `${OUT}/${locale}/ft8.png` })

    // Panorámico de 40 m con el SDR simulado: se deja llenar la cascada.
    await page.getByTestId('digi-ft8').click()
    await page.getByTestId('sdr-button').click()
    await page.getByRole('button', { name: /^(Conectar SDR|Connect SDR)$/ }).click()
    await expect(page.getByTestId('sdr-status')).toContainText('7.150 MHz')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(25_000)
    await page.mouse.move(0, 0)
    await page.screenshot({ path: `${OUT}/${locale}/sdr-espectro.png` })

    // Ventana de ajustes del SDR.
    await page.getByTestId('sdr-button').click()
    await expect(page.getByTestId('sdr-status')).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({ path: `${OUT}/${locale}/sdr-ajustes.png` })
  })
}
