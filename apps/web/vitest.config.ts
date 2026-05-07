import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'components/**/*.test.{ts,tsx}',
      // Phase 9 — opt API route handlers in to the test runner so
      // their thin glue (auth → spine composer → DB write) can be
      // exercised in isolation. Page components stay out — they
      // require a DOM environment we don't configure here.
      'app/api/**/*.test.ts',
    ],
    globals: false,
  },
})
