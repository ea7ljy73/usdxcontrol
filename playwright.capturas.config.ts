import { defineConfig } from '@playwright/test'

// Capturas de la documentación (docs/capturas/<idioma>/): `pnpm capturas`.
export default defineConfig({
  testDir: './scripts/capturas',
  reporter: 'line',
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
