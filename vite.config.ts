import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Worker de FT8/FT4 como módulo ES (importa el WASM igual que la app).
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/i18n/testSetup.ts'],

    exclude: [...configDefaults.exclude, 'e2e/**', 'scripts/capturas/**'],
  },
})
