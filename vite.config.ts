import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: { TAURI_ENV_PLATFORM?: string } }

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13' },
})
