import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The dev-only visualization harness (?viz-harness) reads ../docs/EXERCISES.md.
    fs: { allow: ['..'] },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/setup/dom.ts'],
  },
})
