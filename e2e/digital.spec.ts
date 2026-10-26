import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Teselas del mapa: sin red en las pruebas, se sirve una imagen vacía.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const openFt8 = async (page: Page, errors: string[]) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 }),
  )
  await page.goto('/?radio=mock')
  await page.getByRole('button', { name: 'Conectar radio' }).click()
  await expect(page.getByTestId('connection-status')).toHaveText('Conectado', { timeout: 5_000 })
  await page.getByRole('radio', { name: 'LSB' }).click()
  const ft8 = page.getByTestId('digi-ft8')
  await ft8.scrollIntoViewIfNeeded()
  await ft8.click()
  await expect(ft8).toHaveAttribute('aria-pressed', 'true')
  return ft8
}

// Indicativo y locator se ponen una vez, en Ajustes.
const configureStation = async (page: Page) => {
  await expect(page.getByRole('alert').filter({ hasText: 'pon tu indicativo' })).toBeVisible()
  await page.getByRole('button', { name: 'Ajustes…' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Ajustes FT8' })
  await dialog.getByRole('textbox', { name: 'Mi indicativo' }).fill('EA7TST')
  await dialog.getByRole('textbox', { name: /Mi locator/ }).fill('IM76')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('digi-my-station')).toHaveText('EA7TST · IM76')
}

// La radio simulada reproduce una grabación real de un ciclo FT8 alineada con la hora UTC:
// al cerrar cada ciclo (como mucho 15 s) aparecen sus decodificados.
test('la pantalla FT8 sustituye al panorámico, decodifica y FT4 usa su propio motor', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  const ft8 = await openFt8(page, errors)

  await expect(page.getByTestId('digi-workspace')).toBeVisible()
  await expect(page.getByTestId('spectrum-tune')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Band Activity · FT8' })).toBeVisible()
  // FT8 se recibe en USB y en la frecuencia FT8 de la banda.
  await expect(page.getByRole('radio', { name: 'USB' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: /^40m FT8/ })).toHaveAttribute('aria-pressed', 'true')

  const decodes = page.getByTestId('digi-decodes')
  await expect(decodes).toContainText('W1FC F5BZB -08', { timeout: 25_000 })
  await expect(decodes.locator('tbody tr')).toHaveCount(8)
  await expect(decodes.locator('tbody tr').first()).toContainText(/^\d{6}/)
  await expect(page.getByTestId('digi-status')).toHaveText(/En vivo|Decodificando/)

  // Clic en un decodificado: pasa a ser la estación DX y se preparan Tx1–Tx6.
  await configureStation(page)
  await decodes.getByRole('button', { name: /W1FC F5BZB -08/ }).click()
  await expect(page.getByRole('textbox', { name: /DX indicativo/ })).toHaveValue('F5BZB')
  await expect(page.getByText('F5BZB EA7TST IM76')).toBeVisible()
  await expect(page.getByText('CQ EA7TST IM76')).toBeVisible()

  const a11y = await new AxeBuilder({ page }).analyze()
  expect(a11y.violations).toEqual([])

  await page.getByRole('button', { name: 'Limpiar' }).click()
  await expect(decodes).toHaveCount(0)

  // FT4 usa otro motor (ChromeFT8): basta con que decodifique un ciclo sin error.
  const ft4 = page.getByTestId('digi-ft4')
  await ft4.click()
  await expect(ft4).toHaveAttribute('aria-pressed', 'true')
  await expect(ft8).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('heading', { name: 'Band Activity · FT4' })).toBeVisible()
  await expect(page.getByTestId('digi-enable-tx')).toBeDisabled()
  const panel = page.getByTestId('digi-panel')
  await expect(panel).not.toHaveAttribute('data-decoded-slot', '', { timeout: 20_000 })
  await expect(page.getByTestId('digi-status')).not.toHaveText(/error|No se pudo/i)

  // Pulsar el modo activo vuelve al panorámico.
  await ft4.click()
  await expect(page.getByTestId('digi-workspace')).toHaveCount(0)
  await expect(page.getByTestId('spectrum-tune')).toBeVisible()

  expect(errors).toEqual([])
})

// Una estación simulada (EA3SIM) contesta a nuestro CQ con audio FT8 real.
test('CQ: la estación simulada contesta, la secuencia avanza y Halt corta la emisión', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  await openFt8(page, errors)

  await configureStation(page)

  await page.getByRole('button', { name: 'Llamar CQ' }).click()
  await expect(page.getByTestId('digi-enable-tx')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('digi-tx-status')).toContainText('CQ EA7TST IM76', { timeout: 20_000 })

  const decodes = page.getByTestId('digi-decodes')
  await expect(decodes.locator('tr[data-kind="tx"]').first()).toContainText('CQ EA7TST IM76', { timeout: 30_000 })
  await expect(decodes).toContainText('EA7TST EA3SIM JN11', { timeout: 45_000 })
  await expect(page.getByTestId('digi-qso-phase')).toHaveText('report')
  await expect(page.getByRole('textbox', { name: /DX indicativo/ })).toHaveValue('EA3SIM')
  await expect(page.getByTestId('digi-tx-status')).toContainText(/EA3SIM EA7TST [+-]\d\d/)
  // Rx Frequency: solo el QSO (lo emitido y la respuesta), sin el resto de la banda.
  const rx = page.getByTestId('digi-rx-decodes')
  await expect(rx).toContainText('CQ EA7TST IM76')
  await expect(rx).toContainText('EA7TST EA3SIM JN11')
  await expect(rx).not.toContainText('W1FC F5BZB')

  await page.getByRole('button', { name: 'Halt TX' }).click()
  await expect(page.getByTestId('digi-enable-tx')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('digi-tx-status')).not.toContainText('TX ▶')

  // Tune: portadora en el tono de TX con PTT, y Halt la corta.
  const tune = page.getByRole('button', { name: 'Tune' })
  await tune.click()
  await expect(tune).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('digi-tx-status')).toContainText('TUNE ▶ portadora')
  await page.getByRole('button', { name: 'Halt TX' }).click()
  await expect(tune).toHaveAttribute('aria-pressed', 'false')

  // Mapa con las estaciones oídas.
  await page.getByRole('button', { name: 'Mapa' }).click()
  const map = page.getByRole('dialog', { name: 'Mapa de estaciones' })
  await expect(map).toBeVisible()
  await expect(map.getByTestId('digi-map').locator('.leaflet-interactive').first()).toBeVisible()
  await expect(map.getByTestId('digi-map-count')).toHaveText(/[1-9]\d* estaciones/)
  await page.keyboard.press('Escape')

  // Guardar el QSO en el libro.
  await page.getByRole('button', { name: 'Guardar QSO…' }).click()
  const logDialog = page.getByRole('dialog', { name: 'Guardar QSO' })
  await expect(logDialog.getByRole('textbox', { name: 'Indicativo' })).toHaveValue('EA3SIM')
  await logDialog.getByRole('button', { name: 'Guardar en el libro' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'QSO con EA3SIM guardado' })).toBeVisible()
  await page.getByRole('button', { name: 'Libro (1)' }).click()
  await expect(page.getByTestId('digi-logbook')).toContainText('EA3SIM')
  await page.keyboard.press('Escape')

  // Audio de la radio simulada.
  await page.getByRole('button', { name: 'Audio…' }).click()
  const audio = page.getByRole('dialog', { name: 'Audio de la radio' })
  await expect(audio.getByRole('combobox', { name: 'Entrada (RX)' })).toContainText('Radio simulada (entrada)')
  const a11y = await new AxeBuilder({ page }).analyze()
  expect(a11y.violations).toEqual([])
  await page.keyboard.press('Escape')

  expect(errors).toEqual([])
})
