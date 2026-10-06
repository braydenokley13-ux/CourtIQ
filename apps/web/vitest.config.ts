import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}', 'app/api/health/**/*.test.ts'],
    globals: false,
  },
})
