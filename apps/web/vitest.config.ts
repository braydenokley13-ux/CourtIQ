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
      // Pack 2 §3.1.4 — opt the /dev/scenario-preview pack reader in
      // (the page itself stays out — it's a Next.js Server Component).
      // The helpers in `_packReader.ts` are pure server-side fs+JSON
      // logic, so they round-trip cleanly under the `node` env.
      'app/dev/**/_packReader.test.ts',
    ],
    globals: false,
  },
})
