import { fileURLToPath, URL } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: '.',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    worker: { format: 'es' },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
})
