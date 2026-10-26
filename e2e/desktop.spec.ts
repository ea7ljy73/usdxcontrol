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

// rtl_tcp por el proceso principal, contra un servidor falso: cabecera de 12 bytes,
// órdenes de 5 bytes y flujo IQ continuo.
test('SDR por rtl_tcp en la app de escritorio', async () => {
  const net = await import('node:net')
  const commands: string[] = []
  let iqByte = 0
  const clients: import('node:net').Socket[] = []
  const server = net.createServer((client) => {
    clients.push(client)
    const header = Buffer.from('RTL0\0\0\0\x05\0\0\0\x1d', 'binary')
    client.write(header)
    let pending = Buffer.alloc(0)
    client.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk])
      while (pending.length >= 5) {
        commands.push(`${pending[0]}:${pending.readUInt32BE(1)}`)
        pending = pending.subarray(5)
      }
    })
    const timer = setInterval(() => {
      // Bloques impares a propósito: el cliente tiene que realinear los pares I/Q.
      const block = Buffer.alloc(16_383)
      for (let i = 0; i < block.length; i++) block[i] = (iqByte++ % 2) * 255
      if (!client.destroyed) client.write(block)
    }, 5)
    client.on('close', () => clearInterval(timer))
    client.on('error', () => clearInterval(timer))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port

  const app = await electron.launch({ args: ['.'] })
  const window = await app.firstWindow()
  const errors: string[] = []
  window.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await window.getByTestId('sdr-button').click()
  const dialog = window.getByRole('dialog', { name: 'Receptor SDR' })
  await dialog.getByRole('combobox', { name: 'Conexión' }).selectOption('tcp')
  await dialog.getByRole('textbox', { name: 'Servidor rtl_tcp' }).fill('127.0.0.1')
  await dialog.getByRole('textbox', { name: 'Puerto' }).fill(String(port))
  await dialog.getByRole('button', { name: 'Conectar SDR' }).click()
  await expect(dialog.getByTestId('sdr-status')).toHaveText('Recibiendo')
  // Ancho de muestreo, ppm, muestreo directo Q y ganancia automática.
  await expect.poll(() => commands.join(' ')).toBe('2:2048000 5:0 9:2 3:0')

  // Las muestras llegan alineadas: siempre empiezan en una I (aquí, 0) y con su Q (255).
  const block = await window.evaluate(async () => Array.from(await window.api!.sdr.read(64)))
  expect(block).toHaveLength(64)
  expect(block.slice(0, 4)).toEqual([0, 255, 0, 255])

  // Si el servidor se cae, el proceso principal no se cae: la lectura falla con un motivo.
  clients.forEach((client) => client.destroy())
  server.close()
  const failure = await window.evaluate(() =>
    window.api!.sdr.read(64).then(
      () => 'ok',
      (error: Error) => error.message,
    ),
  )
  expect(failure).toMatch(/rtl_tcp (cerró la conexión|desconectado|no conectado)/)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  await dialog.getByRole('button', { name: 'Desconectar SDR' }).click()
  await expect(dialog.getByTestId('sdr-status')).toHaveText('Desconectado')
  expect(errors).toEqual([])
  await app.close()
})
